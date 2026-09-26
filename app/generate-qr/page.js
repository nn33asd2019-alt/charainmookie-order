"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// จำกัดความยาวข้อความ "เปิดมาแล้ว N นาที" ให้คำนวณจาก created_at ถึงเวลาปัจจุบัน
function minutesSince(createdAt) {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - created);
  return Math.floor(diffMs / 60000);
}

// สร้าง URL หน้าสั่งชานมของโต๊ะนั้น เช่น https://xxx.vercel.app/order/7
function buildOrderUrl(tableNumber) {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  return `${origin}/order/${tableNumber}`;
}

// สร้าง URL รูป QR Code จากบริการฟรี api.qrserver.com (ไม่ต้อง API key, ไม่ต้องติดตั้ง library)
function buildQrImageUrl(targetUrl) {
  const encoded = encodeURIComponent(targetUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;
}

export default function GenerateQrPage() {
  // ---------- STATE: ฟอร์ม ----------
  const [tableNumber, setTableNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Session ที่เปิดค้างอยู่แล้วสำหรับโต๊ะนี้ (แสดงกล่องเตือนแทนการสร้างใหม่)
  const [existingSession, setExistingSession] = useState(null); // { id, table_number, created_at }

  // Session ใหม่ที่เพิ่งสร้างสำเร็จ (แสดงผลลัพธ์ QR)
  const [successSession, setSuccessSession] = useState(null); // { id, table_number, created_at }

  // ---------- STATE: กล่องยืนยันปิดโต๊ะเดิม ----------
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");

  // ---------- STATE: ปุ่มคัดลอกลิงก์ ----------
  const [copied, setCopied] = useState(false);

  // เคลียร์ผลลัพธ์ (กล่องเตือน/กล่องสำเร็จ) เมื่อผู้ใช้แก้เลขโต๊ะใหม่
  function resetResultStates() {
    setExistingSession(null);
    setSuccessSession(null);
    setErrorMsg("");
  }

  function handleTableNumberChange(e) {
    setTableNumber(e.target.value);
    resetResultStates();
  }

  // ---------------------------------------------------------------
  // กดปุ่ม "เปิดโต๊ะ":
  // 1) เช็คก่อนว่ามี session ที่ table_number ตรงกันและ status='open' อยู่ไหม
  // 2) ถ้ามี -> เก็บไว้แสดงกล่องเตือน (ไม่สร้างแถวใหม่)
  // 3) ถ้าไม่มี -> insert แถวใหม่ status='open' แล้วแสดงผล QR
  // ---------------------------------------------------------------
  async function handleOpenTable(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessSession(null);
    setExistingSession(null);

    const tableNumberNum = Number(tableNumber);
    if (!tableNumber || !Number.isInteger(tableNumberNum) || tableNumberNum <= 0) {
      setErrorMsg("กรุณากรอกเลขโต๊ะเป็นจำนวนเต็มบวก");
      return;
    }

    setSubmitting(true);
    try {
      // ขั้นตอนที่ 1: เช็คว่าโต๊ะนี้มี session ที่ยังเปิดอยู่หรือไม่
      const { data: openSession, error: checkError } = await supabase
        .from("sessions")
        .select("id, table_number, created_at")
        .eq("table_number", tableNumberNum)
        .eq("status", "open")
        .maybeSingle();

      if (checkError) {
        setErrorMsg("เกิดข้อผิดพลาดในการตรวจสอบโต๊ะ กรุณาลองใหม่อีกครั้ง");
        return;
      }

      if (openSession) {
        // มี session เปิดค้างอยู่แล้ว -> แสดงกล่องเตือนแทนการสร้างแถวใหม่
        setExistingSession(openSession);
        return;
      }

      // ขั้นตอนที่ 2: ไม่มี session เปิดอยู่ -> สร้างแถวใหม่ (ไม่มี adult_count/child_count แล้ว)
      const { data: newSession, error: insertError } = await supabase
        .from("sessions")
        .insert({
          table_number: tableNumberNum,
          status: "open",
        })
        .select("id, table_number, created_at")
        .single();

      if (insertError) {
        setErrorMsg("เปิดโต๊ะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }

      setSuccessSession(newSession);
    } finally {
      setSubmitting(false);
    }
  }

  // เปิดกล่องยืนยันปิดโต๊ะเดิม
  function handleRequestCloseOld() {
    setCloseError("");
    setShowConfirmClose(true);
  }

  // กด "ยกเลิก" ในกล่องยืนยัน -> ปิดแค่กล่องยืนยัน กลับไปกล่องเตือนเดิม
  function handleCancelClose() {
    setShowConfirmClose(false);
  }

  // กด "ยืนยันปิดโต๊ะเดิม" -> update status เป็น closed เฉพาะแถวนั้น
  // เช็คซ้ำ status ยังเป็น 'open' ตอน update เพื่อกันการกดซ้ำซ้อน (race condition)
  async function handleConfirmClose() {
    if (!existingSession) return;
    setClosing(true);
    setCloseError("");
    try {
      const { data, error } = await supabase
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", existingSession.id)
        .eq("status", "open") // กันกดซ้ำซ้อน / ปิดไปแล้วจากที่อื่น
        .select("id");

      if (error) {
        setCloseError("ปิดโต๊ะเดิมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }

      if (!data || data.length === 0) {
        // ไม่มีแถวไหนถูกอัปเดต แปลว่ามีคนปิด session นี้ไปก่อนแล้ว
        setCloseError("โต๊ะนี้ถูกปิดไปแล้ว กรุณาลองเปิดโต๊ะอีกครั้ง");
        setShowConfirmClose(false);
        setExistingSession(null);
        return;
      }

      // ปิดสำเร็จ -> ปิดกล่องยืนยัน, เอากล่องเตือนออก, กลับไปที่ฟอร์มเดิม (ค่าที่กรอกไว้ยังอยู่)
      // พนักงานต้องกด "เปิดโต๊ะ" อีกครั้งเองเพื่อเปิด session ใหม่ (ไม่เปิดอัตโนมัติ)
      setShowConfirmClose(false);
      setExistingSession(null);
    } finally {
      setClosing(false);
    }
  }

  // ปุ่ม "เปิดโต๊ะใหม่" ในกล่องผลลัพธ์สำเร็จ -> ล้างฟอร์มทั้งหมดกลับไปเริ่มใหม่
  function handleNewTable() {
    setTableNumber("");
    setSuccessSession(null);
    setExistingSession(null);
    setErrorMsg("");
    setCopied(false);
  }

  // ปุ่ม "คัดลอกลิงก์" ใต้ QR
  async function handleCopyLink() {
    if (!orderUrl) return;
    try {
      await navigator.clipboard.writeText(orderUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setCopied(false);
    }
  }

  const orderUrl = successSession ? buildOrderUrl(successSession.table_number) : "";

  return (
    <main className="min-h-screen bg-cream flex flex-col items-center gap-6 px-4 py-8">
      <h1 className="text-center text-2xl font-bold text-coffee">
        เปิดโต๊ะให้ลูกค้า 🧋
      </h1>

      {/* ---------- ฟอร์มกรอกเลขโต๊ะ (ซ่อนตอนแสดงผลลัพธ์สำเร็จ เพื่อลดความสับสน) ---------- */}
      {!successSession && (
        <form
          onSubmit={handleOpenTable}
          className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm"
        >
          <label htmlFor="tableNumber" className="mb-2 block text-lg font-bold text-coffee">
            เลขโต๊ะ
          </label>
          <input
            id="tableNumber"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={tableNumber}
            onChange={handleTableNumberChange}
            placeholder="เช่น 7"
            required
            className="mb-4 w-full rounded-xl border-2 border-latte/40 px-4 py-3 text-2xl font-bold text-coffee focus:border-coffee focus:outline-none"
          />

          {errorMsg && (
            <p className="mb-4 font-bold text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-coffee py-4 text-xl font-bold text-cream shadow active:scale-95 disabled:opacity-50"
          >
            {submitting ? "กำลังเปิดโต๊ะ..." : "เปิดโต๊ะ"}
          </button>
        </form>
      )}

      {/* ---------- กล่องเตือน: โต๊ะนี้มี session เปิดค้างอยู่แล้ว ---------- */}
      {existingSession && (
        <div className="w-full max-w-md rounded-3xl border-4 border-red-500 bg-red-50 p-6 shadow-sm">
          <p className="mb-2 text-xl font-bold text-red-800">
            ⚠️ โต๊ะนี้มีลูกค้าเปิดใช้งานอยู่แล้ว
            <br />
            กรุณาปิดออเดอร์เดิมก่อน
          </p>
          <p className="mb-4 text-lg text-coffee/80">
            โต๊ะ {existingSession.table_number}
            <br />
            เปิดมาแล้ว {minutesSince(existingSession.created_at)} นาที
          </p>
          <button
            type="button"
            onClick={handleRequestCloseOld}
            className="w-full rounded-2xl bg-red-600 py-4 text-xl font-bold text-white shadow active:scale-95"
          >
            ปิดออเดอร์เดิม
          </button>
        </div>
      )}

      {/* ---------- กล่องยืนยันปิดโต๊ะเดิม (modal กลางจอ) ---------- */}
      {showConfirmClose && existingSession && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-coffee/50 px-4"
        >
          <div className="w-full max-w-sm rounded-3xl border-4 border-orange-400 bg-white p-6">
            <h2 className="mb-2 text-xl font-bold text-orange-700">
              ยืนยันปิดโต๊ะเดิม
            </h2>
            <p className="mb-4 text-lg text-coffee/80">
              โต๊ะ {existingSession.table_number}
              <br />
              เปิดมาแล้ว {minutesSince(existingSession.created_at)} นาที
            </p>

            {closeError && (
              <p className="mb-3 font-bold text-red-600">{closeError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancelClose}
                disabled={closing}
                className="flex-1 rounded-xl bg-latte/20 py-3 text-lg font-bold text-coffee active:scale-95"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmClose}
                disabled={closing}
                className="flex-1 rounded-xl bg-red-600 py-3 text-lg font-bold text-white shadow active:scale-95 disabled:opacity-50"
              >
                {closing ? "กำลังปิด..." : "ยืนยันปิดโต๊ะเดิม"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- กล่องผลลัพธ์: เปิดโต๊ะสำเร็จ พร้อม QR Code ---------- */}
      {successSession && (
        <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-sm">
          <p className="mb-3 text-xl font-bold text-green-700">✅ เปิดโต๊ะสำเร็จ</p>

          {/* รูป QR แบบ <img> ธรรมดา ไม่ต้องติดตั้ง library เพิ่ม */}
          <img
            src={buildQrImageUrl(orderUrl)}
            alt={`QR Code สำหรับโต๊ะ ${successSession.table_number}`}
            width={300}
            height={300}
            className="mx-auto mb-3 h-auto max-w-full"
          />

          <p className="mb-3 text-lg font-bold text-coffee">
            โต๊ะ {successSession.table_number} · charainmookie
          </p>

          {/* ลิงก์เต็มที่ QR ชี้ไป + ปุ่มคัดลอก */}
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            <span className="break-all text-sm text-coffee/70">{orderUrl}</span>
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-shrink-0 rounded-lg bg-coffee px-3 py-2 text-sm font-bold text-cream active:scale-95"
            >
              {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
            </button>
          </div>

          <button
            type="button"
            onClick={handleNewTable}
            className="w-full rounded-2xl bg-coffee py-4 text-xl font-bold text-cream shadow active:scale-95"
          >
            เปิดโต๊ะใหม่
          </button>
        </div>
      )}
    </main>
  );
}
