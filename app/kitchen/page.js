"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// สถานะออเดอร์ที่ต้องแสดงบนหน้าจอเคาน์เตอร์ (ยังไม่เสิร์ฟ)
const VISIBLE_STATUSES = ["received", "cooking"];

// จัดรูปแบบเวลาที่สั่ง เช่น "14:32"
function formatOrderTime(createdAt) {
  return new Date(createdAt).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// เรียงออเดอร์จากเก่าไปใหม่ตาม created_at
function sortByCreatedAtAsc(orders) {
  return [...orders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // เก็บ id ของออเดอร์ที่เพิ่งเข้ามาใหม่ เพื่อเล่นแอนิเมชันไฮไลต์ชั่วคราว
  const [highlightIds, setHighlightIds] = useState(new Set());

  // เก็บ id ที่กำลังกดปุ่ม (กันกดซ้ำระหว่างรอ update)
  const [updatingIds, setUpdatingIds] = useState(new Set());

  const audioCtxRef = useRef(null);

  // ---------------------------------------------------------------
  // เสียงกระดิ่งแจ้งเตือนออเดอร์ใหม่: สร้างเสียง beep สั้นๆ ด้วย
  // Web Audio API เอง ไม่ต้องพึ่งไฟล์เสียงภายนอก (ไม่มี asset ให้โหลด)
  // ---------------------------------------------------------------
  function playBell() {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // เสียงโทนกระดิ่งเบาๆ
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.5);
    } catch (err) {
      // ถ้าเล่นเสียงไม่ได้ (เช่น browser บล็อก autoplay) ไม่ต้องทำอะไรต่อ
    }
  }

  // เพิ่ม id เข้า highlight set ชั่วคราว แล้วเอาออกหลัง 2 วิ (จบแอนิเมชัน)
  function triggerHighlight(orderId) {
    setHighlightIds((prev) => new Set(prev).add(orderId));
    setTimeout(() => {
      setHighlightIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }, 2000);
  }

  // ---------------------------------------------------------------
  // โหลดออเดอร์ทั้งหมดที่ status เป็น received หรือ cooking ตอนเปิดหน้าครั้งแรก
  // ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadInitialOrders() {
      setLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("orders")
        .select("id, table_number, items, status, created_at")
        .in("status", VISIBLE_STATUSES)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setLoadError("โหลดออเดอร์ไม่สำเร็จ กรุณารีเฟรชหน้าจอ");
        setLoading(false);
        return;
      }

      setOrders(data || []);
      setLoading(false);
    }

    loadInitialOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------
  // Supabase Realtime: ฟังการเปลี่ยนแปลงตาราง orders ทั้ง INSERT และ UPDATE
  // เพื่อให้ออเดอร์ใหม่เด้งขึ้น หรือสถานะอัปเดตทันทีโดยไม่ต้องรีเฟรช
  // ---------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel("kitchen-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new;
          // แสดงเฉพาะออเดอร์ที่ยังไม่เสิร์ฟ (received/cooking)
          if (!VISIBLE_STATUSES.includes(newOrder.status)) return;

          setOrders((prev) => {
            // กันซ้ำ เผื่อ id นี้มีอยู่แล้ว
            if (prev.some((o) => o.id === newOrder.id)) return prev;
            return sortByCreatedAtAsc([...prev, newOrder]);
          });

          triggerHighlight(newOrder.id);
          playBell();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updatedOrder = payload.new;

          setOrders((prev) => {
            if (!VISIBLE_STATUSES.includes(updatedOrder.status)) {
              // เปลี่ยนเป็น served (หรือสถานะอื่นที่ไม่ต้องแสดง) -> เอาการ์ดออกจากจอ
              return prev.filter((o) => o.id !== updatedOrder.id);
            }
            // ยังอยู่ในสถานะที่ต้องแสดง -> อัปเดตข้อมูลในการ์ดเดิม
            const exists = prev.some((o) => o.id === updatedOrder.id);
            if (!exists) {
              return sortByCreatedAtAsc([...prev, updatedOrder]);
            }
            return prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
          });
        }
      )
      .subscribe();

    // เลิก subscribe เมื่อออกจากหน้า (ปกติหน้านี้จะเปิดค้างไว้ตลอด ไม่ค่อย unmount)
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ---------------------------------------------------------------
  // ปุ่ม "เริ่มทำ" -> update status = 'cooking'
  // ---------------------------------------------------------------
  async function handleStartCooking(orderId) {
    if (updatingIds.has(orderId)) return;
    setUpdatingIds((prev) => new Set(prev).add(orderId));

    const { error } = await supabase
      .from("orders")
      .update({ status: "cooking" })
      .eq("id", orderId)
      .eq("status", "received"); // กันกดซ้ำซ้อน / กันเปลี่ยนสถานะผิดจังหวะ

    setUpdatingIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });

    if (error) {
      // การอัปเดต state จริงจะมาจาก realtime event UPDATE อยู่แล้ว
      // ถ้า error แค่ปล่อยให้บาริสต้ากดใหม่ได้ ไม่ต้อง block UI เพิ่ม
      console.error("อัปเดตสถานะ 'เริ่มทำ' ไม่สำเร็จ:", error.message);
    }
  }

  // ---------------------------------------------------------------
  // ปุ่ม "จัดเสิร์ฟแล้ว" -> update status = 'served' การ์ดจะหายไปเอง
  // ผ่าน realtime UPDATE event (filter ออกเพราะไม่อยู่ใน VISIBLE_STATUSES)
  // ---------------------------------------------------------------
  async function handleMarkServed(orderId) {
    if (updatingIds.has(orderId)) return;
    setUpdatingIds((prev) => new Set(prev).add(orderId));

    // เอาการ์ดออกจากจอทันที ไม่ต้องรอ realtime event กลับมา (responsive กว่า)
    setOrders((prev) => prev.filter((o) => o.id !== orderId));

    const { error } = await supabase
      .from("orders")
      .update({ status: "served" })
      .eq("id", orderId)
      .in("status", ["received", "cooking"]);

    setUpdatingIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });

    if (error) {
      console.error("อัปเดตสถานะ 'จัดเสิร์ฟแล้ว' ไม่สำเร็จ:", error.message);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4e9d8] px-4 py-6">
      {/* ---------- หัวข้อหน้าจอเคาน์เตอร์ ---------- */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-coffee">
          🧋 charainmookie — หน้าจอเคาน์เตอร์
        </h1>
        <span className="rounded-full bg-white px-4 py-2 text-lg font-bold text-coffee shadow-sm">
          {orders.length} ออเดอร์รอดำเนินการ
        </span>
      </div>

      {loading && <p className="text-xl text-coffee/70">กำลังโหลดออเดอร์...</p>}
      {loadError && <p className="text-xl font-bold text-red-600">{loadError}</p>}

      {!loading && !loadError && orders.length === 0 && (
        <p className="text-xl text-coffee/60">ยังไม่มีออเดอร์ค้างอยู่ 🎉</p>
      )}

      {/* ---------- Grid การ์ดออเดอร์ ---------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {orders.map((order) => {
          const isCooking = order.status === "cooking";
          const isHighlighted = highlightIds.has(order.id);
          const isUpdating = updatingIds.has(order.id);

          return (
            <div
              key={order.id}
              className={`rounded-3xl border-4 p-5 shadow-md transition-all duration-500 ${
                isCooking
                  ? "border-orange-300 bg-orange-50"
                  : "border-latte/30 bg-white"
              } ${isHighlighted ? "scale-[1.03] ring-4 ring-yellow-300 animate-pulse" : ""}`}
            >
              {/* เลขโต๊ะตัวใหญ่ + เวลาที่สั่ง */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-4xl font-extrabold text-coffee">
                  โต๊ะ {order.table_number}
                </span>
                <span className="text-lg font-bold text-coffee/60">
                  {formatOrderTime(order.created_at)}
                </span>
              </div>

              {/* ป้ายสถานะ */}
              <div className="mb-3">
                <span
                  className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${
                    isCooking
                      ? "bg-orange-400 text-white"
                      : "bg-latte text-white"
                  }`}
                >
                  {isCooking ? "กำลังทำ" : "รอทำ"}
                </span>
              </div>

              {/* รายการเครื่องดื่ม/ท็อปปิ้งทั้งหมดในออเดอร์นี้ */}
              <ul className="mb-4 space-y-1">
                {(order.items || []).map((line, idx) => (
                  <li
                    key={`${order.id}-${idx}`}
                    className="text-xl font-semibold text-coffee"
                  >
                    • {line.name} × {line.quantity}
                  </li>
                ))}
              </ul>

              {/* ปุ่มควบคุมสถานะ */}
              <div className="flex gap-2">
                {!isCooking && (
                  <button
                    type="button"
                    onClick={() => handleStartCooking(order.id)}
                    disabled={isUpdating}
                    className="flex-1 rounded-xl bg-orange-400 py-3 text-lg font-bold text-white shadow active:scale-95 disabled:opacity-50"
                  >
                    เริ่มทำ
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleMarkServed(order.id)}
                  disabled={isUpdating}
                  className="flex-1 rounded-xl bg-coffee py-3 text-lg font-bold text-cream shadow active:scale-95 disabled:opacity-50"
                >
                  จัดเสิร์ฟแล้ว
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
