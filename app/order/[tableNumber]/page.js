"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

// จำนวนรายการ (บรรทัด) สูงสุดในตะกร้าต่อการส่งออเดอร์ 1 ครั้ง
const MAX_CART_ITEMS = 10;
// จำนวนแก้ว/ชิ้นต่อรายการ เลือกได้ 1-5
const MAX_QTY_PER_LINE = 5;

export default function OrderPage({ params }) {
  // ⚠️ Next.js เวอร์ชันล่าสุด: params เป็น Promise เสมอ ต้อง unwrap ด้วย use()
  // ห้ามเขียน const { tableNumber } = params ตรงๆ เด็ดขาด
  const { tableNumber } = use(params);
  const tableNumberNum = Number(tableNumber);

  // ---------- STATE: สถานะโต๊ะ / session ----------
  // หมายเหตุ: sessions ไม่มี adult_count/child_count แล้ว (ร้านชานมคาเฟ่ ไม่ใช่บุฟเฟต์)
  const [checkingSession, setCheckingSession] = useState(true);
  const [session, setSession] = useState(null); // { id, table_number, created_at }
  const [sessionNotFound, setSessionNotFound] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);

  // ---------- STATE: เมนู ----------
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]); // ทุกเมนู (ทุกหมวด) รวม price
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState("");

  // ---------- STATE: ตะกร้า ----------
  const [quantities, setQuantities] = useState({}); // { [itemId]: number }
  const [cart, setCart] = useState([]); // [{ key, name, quantity }]
  const [cartOpen, setCartOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successToast, setSuccessToast] = useState(false);

  // ---------- STATE: เรียกพนักงาน / เช็คบิล ----------
  const [showBillConfirm, setShowBillConfirm] = useState(false);
  const [billLoading, setBillLoading] = useState(false);
  const [billLines, setBillLines] = useState([]); // [{ name, quantity, price, lineTotal }]
  const [billTotal, setBillTotal] = useState(0);
  const [billing, setBilling] = useState(false);
  const [billError, setBillError] = useState("");

  // ---------------------------------------------------------------
  // ขั้นตอนที่ 1: เช็คสถานะโต๊ะ — หา session ที่ table_number ตรงกัน
  // และ status = 'open' เมื่อเข้าหน้านี้ครั้งแรก
  // ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      setCheckingSession(true);
      setSessionNotFound(false);

      if (!Number.isInteger(tableNumberNum) || tableNumberNum <= 0) {
        setSessionNotFound(true);
        setCheckingSession(false);
        return;
      }

      const { data, error } = await supabase
        .from("sessions")
        .select("id, table_number, created_at")
        .eq("table_number", tableNumberNum)
        .eq("status", "open")
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setSessionNotFound(true);
        setSession(null);
      } else {
        setSession(data);
        setSessionNotFound(false);
      }
      setCheckingSession(false);
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [tableNumberNum]);

  // ---------------------------------------------------------------
  // ขั้นตอนที่ 2: เมื่อเจอ session ที่เปิดอยู่แล้ว ให้โหลดเมนู
  // จาก menu_categories และ menu_items มาเตรียมแสดงเป็นแท็บ
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function loadMenu() {
      setMenuLoading(true);
      setMenuError("");

      const [categoriesRes, itemsRes] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("id, name, sort_order")
          .order("sort_order", { ascending: true }),
        // select price มาด้วย เพื่อใช้คำนวณยอดเช็คบิลตอนกดเรียกพนักงาน
        // (ถ้าตาราง menu_items ยังไม่มีคอลัมน์ price ค่านี้จะเป็น undefined
        // และระบบจะคำนวณยอดรวมเป็น 0 แทนที่จะ error)
        supabase.from("menu_items").select("id, category_id, name, price"),
      ]);

      if (cancelled) return;

      if (categoriesRes.error || itemsRes.error) {
        setMenuError("โหลดเมนูไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setMenuLoading(false);
        return;
      }

      const loadedCategories = categoriesRes.data || [];
      setCategories(loadedCategories);
      setItems(itemsRes.data || []);
      if (loadedCategories.length > 0) {
        setActiveCategoryId(loadedCategories[0].id);
      }
      setMenuLoading(false);
    }

    loadMenu();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // จำนวนที่เลือกไว้ของเมนูแต่ละอัน (ก่อนกดปุ่ม + ใส่ตะกร้า) ค่าเริ่มต้น 1
  function getQuantity(itemId) {
    return quantities[itemId] ?? 1;
  }

  function changeQuantity(itemId, delta) {
    setQuantities((prev) => {
      const current = prev[itemId] ?? 1;
      const next = Math.min(MAX_QTY_PER_LINE, Math.max(1, current + delta));
      return { ...prev, [itemId]: next };
    });
  }

  // กดปุ่ม + ที่การ์ดเมนู เพื่อใส่รายการนั้นลงตะกร้า
  function handleAddToCart(item) {
    if (cart.length >= MAX_CART_ITEMS) return; // เต็มแล้ว ไม่ให้เพิ่มอีก
    const quantity = getQuantity(item.id);
    setCart((prev) => [
      ...prev,
      {
        key: `${item.id}-${Date.now()}-${Math.random()}`,
        name: item.name,
        quantity,
      },
    ]);
  }

  function handleRemoveCartLine(key) {
    setCart((prev) => prev.filter((line) => line.key !== key));
  }

  const totalCartQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartFull = cart.length >= MAX_CART_ITEMS;

  // ---------------------------------------------------------------
  // กดปุ่ม "ส่งออเดอร์" -> insert 1 แถวใหม่ลงตาราง orders
  // ---------------------------------------------------------------
  async function handleSubmitOrder() {
    if (!session || cart.length === 0) return;
    setSubmitting(true);
    setSubmitError("");

    const { error } = await supabase.from("orders").insert({
      session_id: session.id,
      table_number: tableNumberNum,
      items: cart.map(({ name, quantity }) => ({ name, quantity })), // jsonb
      status: "received",
    });

    setSubmitting(false);

    if (error) {
      setSubmitError("ส่งออเดอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    // ส่งสำเร็จ -> เคลียร์ตะกร้า, ปิดลิ้นชัก, ขึ้นข้อความแจ้งเตือน, หน้าไม่หายไปไหน สั่งรอบใหม่ต่อได้ทันที
    setCart([]);
    setCartOpen(false);
    setSuccessToast(true);
    setTimeout(() => setSuccessToast(false), 2500);
  }

  // ---------------------------------------------------------------
  // กดปุ่ม "เรียกพนักงาน / เช็คบิล"
  // ดึงออเดอร์ *ทั้งหมด* ของ session นี้จากตาราง orders (ทุกรอบที่เคยส่ง)
  // มารวมจำนวนต่อชื่อเมนู แล้วคูณราคาจาก menu_items เพื่อให้ได้สรุปรายการ + ยอดสุทธิ
  // ---------------------------------------------------------------
  async function handleOpenBillConfirm() {
    if (!session) return;
    setBillError("");
    setBillLoading(true);
    setBillLines([]);
    setShowBillConfirm(true);

    const { data: orderRows, error } = await supabase
      .from("orders")
      .select("items")
      .eq("session_id", session.id);

    if (error) {
      setBillError("คำนวณยอดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setBillLoading(false);
      return;
    }

    // lookup ชื่อเมนู -> ราคา จากเมนูที่โหลดไว้แล้ว
    const priceByName = {};
    items.forEach((item) => {
      priceByName[item.name] = Number(item.price) || 0;
    });

    // รวมจำนวนของเมนูชื่อเดียวกันจากทุกออเดอร์ที่เคยส่ง เพื่อแสดงเป็นสรุปรายการเดียวต่อเมนู
    const quantityByName = {};
    (orderRows || []).forEach((order) => {
      (order.items || []).forEach((line) => {
        quantityByName[line.name] = (quantityByName[line.name] || 0) + (line.quantity || 0);
      });
    });

    const lines = Object.entries(quantityByName).map(([name, quantity]) => {
      const price = priceByName[name] ?? 0;
      return { name, quantity, price, lineTotal: price * quantity };
    });

    const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

    setBillLines(lines);
    setBillTotal(total);
    setBillLoading(false);
  }

  // กดยืนยันในกล่องเช็คบิล -> ปิด session (status = 'closed')
  async function handleConfirmBill() {
    if (!session) return;
    setBilling(true);
    setBillError("");

    const { data, error } = await supabase
      .from("sessions")
      .update({ status: "closed" })
      .eq("id", session.id)
      .eq("status", "open") // กันกดซ้ำซ้อน / ปิดไปแล้วจากที่อื่น
      .select("id");

    setBilling(false);

    if (error) {
      setBillError("ปิดโต๊ะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    if (!data || data.length === 0) {
      setBillError("โต๊ะนี้ถูกปิดไปแล้ว");
      setShowBillConfirm(false);
      setSessionClosed(true);
      return;
    }

    // ปิดสำเร็จ -> ล็อกไม่ให้สั่งอาหารต่อได้อีก แสดงหน้าขอบคุณเต็มจอ
    setShowBillConfirm(false);
    setSessionClosed(true);
  }

  // ================= RENDER: สถานะต่างๆ ของหน้า =================

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-cream">
        <p className="text-lg text-coffee/70">กำลังโหลด...</p>
      </main>
    );
  }

  if (sessionNotFound) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 bg-cream px-6 text-center">
        <h1 className="text-2xl font-bold text-red-700">
          โต๊ะนี้ยังไม่เปิดใช้งาน หรือโต๊ะปิดบริการแล้ว
        </h1>
        <p className="text-lg text-coffee/80">กรุณาแจ้งพนักงาน</p>
      </main>
    );
  }

  if (sessionClosed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 bg-cream px-6 text-center">
        <h1 className="text-2xl font-bold text-green-700">
          ขอบคุณที่ใช้บริการ charainmookie ค่ะ/ครับ 🧋✨
        </h1>
        <p className="text-lg text-coffee/80">แล้วพบกันใหม่นะคะ</p>
      </main>
    );
  }

  const activeItems = items.filter((item) => item.category_id === activeCategoryId);

  return (
    <main className="min-h-screen bg-cream pb-28">
      {/* ---------- แถบบนสุด: ชื่อร้าน/เลขโต๊ะ + ปุ่มเรียกพนักงาน/เช็คบิล ---------- */}
      <div className="sticky top-0 z-20 flex items-center justify-between bg-coffee px-4 py-3 text-cream shadow-md">
        <div>
          <div className="text-lg font-bold">charainmookie 🧋</div>
          <div className="text-sm opacity-80">โต๊ะ {tableNumberNum}</div>
        </div>
        <button
          type="button"
          onClick={handleOpenBillConfirm}
          className="rounded-full bg-latte px-4 py-2 text-sm font-bold text-white shadow active:scale-95"
        >
          เรียกพนักงาน / เช็คบิล
        </button>
      </div>

      {/* ---------- แท็บหมวดหมู่เมนู เลื่อนซ้าย-ขวาได้ ---------- */}
      {categories.length > 0 && (
        <div className="sticky top-[64px] z-10 flex gap-2 overflow-x-auto border-b border-latte/20 bg-cream px-4 py-3">
          {categories.map((cat) => {
            const active = cat.id === activeCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-base font-bold transition ${
                  active
                    ? "bg-coffee text-cream"
                    : "border-2 border-latte/40 bg-white text-coffee"
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ---------- รายการเมนูของหมวดที่เลือกอยู่ ---------- */}
      <div className="px-4 py-4">
        {menuLoading && <p className="text-coffee/70">กำลังโหลดเมนู...</p>}
        {menuError && <p className="font-bold text-red-600">{menuError}</p>}
        {!menuLoading && !menuError && activeItems.length === 0 && (
          <p className="text-coffee/60">ยังไม่มีเมนูในหมวดนี้</p>
        )}

        {!menuLoading &&
          !menuError &&
          activeItems.map((item) => (
            <div
              key={item.id}
              className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"
            >
              <div className="flex-1">
                <div className="text-lg font-bold text-coffee">{item.name}</div>
                {typeof item.price === "number" && (
                  <div className="text-sm text-coffee/60">{item.price} บาท</div>
                )}
              </div>

              {/* ตัวเลือกจำนวน 1-5 ก่อนกดใส่ตะกร้า */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => changeQuantity(item.id, -1)}
                  aria-label="ลดจำนวน"
                  className="h-10 w-10 rounded-xl border-2 border-latte/40 bg-white text-xl font-bold text-coffee active:scale-95"
                >
                  −
                </button>
                <span className="w-6 text-center text-lg font-bold text-coffee">
                  {getQuantity(item.id)}
                </span>
                <button
                  type="button"
                  onClick={() => changeQuantity(item.id, 1)}
                  aria-label="เพิ่มจำนวน"
                  className="h-10 w-10 rounded-xl border-2 border-latte/40 bg-white text-xl font-bold text-coffee active:scale-95"
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={() => handleAddToCart(item)}
                  disabled={cartFull}
                  aria-label={`เพิ่ม ${item.name} ลงตะกร้า`}
                  className={`h-11 w-11 flex-shrink-0 rounded-xl text-2xl font-bold text-cream shadow active:scale-95 ${
                    cartFull ? "bg-coffee/40" : "bg-coffee"
                  }`}
                >
                  +
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* ---------- ตะกร้าลอย (Floating Cart) ด้านล่างจอ ---------- */}
      {cart.length > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between bg-coffee px-5 py-4 text-cream shadow-[0_-2px_10px_rgba(0,0,0,0.15)]"
        >
          <span className="text-lg font-bold">
            🧺 ตะกร้า {cart.length} รายการ ({totalCartQuantity} แก้ว)
          </span>
          <span className="text-base font-bold underline">ดูตะกร้า</span>
        </button>
      )}

      {/* ---------- ข้อความแจ้งส่งออเดอร์สำเร็จ ---------- */}
      {successToast && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-green-700 px-5 py-3 font-bold text-white shadow-lg">
          ส่งออเดอร์ชานมเรียบร้อยแล้ว!
        </div>
      )}

      {/* ---------- ลิ้นชักตะกร้า (เลื่อนขึ้นจากด้านล่าง) ---------- */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-coffee/50"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-cream p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-xl font-bold text-coffee">ตะกร้าของคุณ</h2>

            {cart.length === 0 ? (
              <p className="text-coffee/60">ยังไม่มีรายการในตะกร้า</p>
            ) : (
              cart.map((line) => (
                <div
                  key={line.key}
                  className="flex items-center justify-between border-b border-latte/20 py-3"
                >
                  <span className="text-base text-coffee">
                    {line.name} × {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCartLine(line.key)}
                    className="font-bold text-red-600"
                  >
                    ลบ
                  </button>
                </div>
              ))
            )}

            {submitError && (
              <p className="mt-3 font-bold text-red-600">{submitError}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="flex-1 rounded-xl bg-latte/20 py-3 text-lg font-bold text-coffee active:scale-95"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={submitting || cart.length === 0}
                className="flex-1 rounded-xl bg-coffee py-3 text-lg font-bold text-cream shadow active:scale-95 disabled:opacity-50"
              >
                {submitting ? "กำลังส่ง..." : "ส่งออเดอร์"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- กล่องยืนยันเรียกพนักงาน / เช็คบิล ---------- */}
      {showBillConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-coffee/50 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6">
            <h2 className="mb-2 text-xl font-bold text-coffee">
              ยืนยันเรียกพนักงาน / เช็คบิล
            </h2>
            <p className="mb-3 text-coffee/70">โต๊ะ {tableNumberNum}</p>

            {billLoading ? (
              <p className="my-4 text-coffee/70">กำลังคำนวณยอดรวม...</p>
            ) : (
              <>
                {/* สรุปรายการที่สั่งไปทั้งหมด */}
                <div className="mb-3 max-h-48 overflow-y-auto">
                  {billLines.length === 0 ? (
                    <p className="text-coffee/60">ยังไม่มีรายการที่สั่ง</p>
                  ) : (
                    billLines.map((line) => (
                      <div
                        key={line.name}
                        className="flex items-center justify-between border-b border-latte/20 py-2 text-sm"
                      >
                        <span className="text-coffee">
                          {line.name} × {line.quantity}
                        </span>
                        <span className="font-bold text-coffee">
                          {line.lineTotal.toLocaleString()} บาท
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <p className="my-3 text-2xl font-bold text-coffee">
                  ยอดที่ต้องชำระ {billTotal.toLocaleString()} บาท
                </p>
              </>
            )}

            {billError && (
              <p className="mb-3 font-bold text-red-600">{billError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowBillConfirm(false)}
                disabled={billing}
                className="flex-1 rounded-xl bg-latte/20 py-3 text-lg font-bold text-coffee active:scale-95"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmBill}
                disabled={billing || billLoading}
                className="flex-1 rounded-xl bg-coffee py-3 text-lg font-bold text-cream shadow active:scale-95 disabled:opacity-50"
              >
                {billing ? "กำลังปิด..." : "ยืนยันชำระเงิน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
