export default function GenerateQrPage() {
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
      <h1>สร้าง QR Code สำหรับโต๊ะ</h1>
      <p style={{ color: "#7a5c3e" }}>
        หน้านี้เป็นโครงเริ่มต้น — ยังไม่มีการสร้าง QR Code จริง
        (จะเพิ่มในขั้นตอนถัดไป)
      </p>
    </main>
  );
}
