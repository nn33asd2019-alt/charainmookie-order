export default function KitchenPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1>หน้าจอเคาน์เตอร์ / บาริสต้า</h1>
      <p style={{ color: "#7a5c3e" }}>
        หน้านี้เป็นโครงเริ่มต้น — ยังไม่มีการดึงออเดอร์จริงจาก Supabase
        (จะเพิ่มในขั้นตอนถัดไป)
      </p>
    </main>
  );
}
