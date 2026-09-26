export const metadata = {
  title: "charainmookie",
  description: "ระบบสั่งชานมและเครื่องดื่ม ร้าน charainmookie",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#fdf6ec",
          color: "#3b2a1a",
        }}
      >
        {children}
      </body>
    </html>
  );
}
