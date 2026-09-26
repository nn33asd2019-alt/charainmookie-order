import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "2rem", margin: 0 }}>
        charainmookie - ระบบสั่งชานมและเครื่องดื่ม
      </h1>
      <p style={{ color: "#7a5c3e" }}>
        เลือกเมนูด้านล่างเพื่อทดสอบว่าระบบ deploy สำเร็จ
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link
          href="/generate-qr"
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "8px",
            backgroundColor: "#3b2a1a",
            color: "#fdf6ec",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          สร้าง QR Code สำหรับโต๊ะ
        </Link>
        <Link
          href="/kitchen"
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "8px",
            backgroundColor: "#a97142",
            color: "#fdf6ec",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          หน้าจอเคาน์เตอร์ / บาริสต้า
        </Link>
      </div>
    </main>
  );
}
