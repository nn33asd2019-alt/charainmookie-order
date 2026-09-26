# charainmookie

ระบบสั่งอาหารและเครื่องดื่มสำหรับร้านชานมคาเฟ่ "charainmookie"
สร้างด้วย Next.js (App Router, JavaScript) และเชื่อมต่อฐานข้อมูลผ่าน Supabase
ออกแบบมาเพื่อ deploy บน Vercel

## เทคโนโลยีที่ใช้

- Next.js (App Router) — **เวอร์ชันล่าสุด**
- React
- Supabase (`@supabase/supabase-js`)
- Vercel สำหรับ deploy

## ⚠️ หมายเหตุสำคัญ: Dynamic Route Params เป็น Promise

Next.js เวอร์ชันล่าสุดเปลี่ยนให้ `params` (และ `searchParams`) ใน Dynamic Route
เป็น **Promise** แล้ว ไม่ใช่ object ธรรมดาเหมือนเวอร์ชันก่อนหน้า

เมื่อสร้างหน้าเช่น `app/table/[tableNumber]/page.js` (จะใช้ในขั้นตอนถัดไปสำหรับ
หน้าสั่งชานมของลูกค้าแต่ละโต๊ะ) **ต้อง unwrap ค่า params ด้วย `use()` จาก React เสมอ**

ตัวอย่างแนวทางที่ถูกต้อง (Client Component):

\`\`\`jsx
"use client";
import { use } from "react";

export default function TablePage({ params }) {
  const { tableNumber } = use(params);
  // ใช้ tableNumber ต่อได้เลย
}
\`\`\`

หรือถ้าเป็น Server Component (async function) สามารถ `await params` ได้โดยตรง:

\`\`\`jsx
export default async function TablePage({ params }) {
  const { tableNumber } = await params;
}
\`\`\`

**ห้ามใช้ `params.tableNumber` ตรง ๆ แบบเวอร์ชันเก่า** เพราะจะทำให้เกิด error
หรือ warning เรื่อง params ไม่ได้ถูก unwrap ก่อนใช้งาน

## โครงสร้างฐานข้อมูล (Supabase)

ตารางเหล่านี้ถูกสร้างไว้ใน Supabase แล้ว (ไม่ต้องสร้างใหม่ในโค้ด)
ใช้เป็นข้อมูลอ้างอิงสำหรับการพัฒนาในขั้นตอนถัดไป:

### `sessions`
| คอลัมน์      | ประเภท    | คำอธิบาย                          |
|--------------|-----------|------------------------------------|
| id           | uuid/int  | primary key                        |
| table_number | text/int  | หมายเลขโต๊ะ                        |
| adult_count  | int       | จำนวนผู้ใหญ่                       |
| child_count  | int       | จำนวนเด็ก                          |
| status       | text      | สถานะของ session                   |
| created_at   | timestamp | เวลาที่สร้าง session                |

### `menu_categories`
| คอลัมน์    | ประเภท   | คำอธิบาย            |
|------------|----------|----------------------|
| id         | uuid/int | primary key          |
| name       | text     | ชื่อหมวดหมู่เมนู      |
| sort_order | int      | ลำดับการแสดงผล        |

### `menu_items`
| คอลัมน์     | ประเภท   | คำอธิบาย                     |
|-------------|----------|--------------------------------|
| id          | uuid/int | primary key                    |
| category_id | uuid/int | อ้างอิง `menu_categories.id`   |
| name        | text     | ชื่อเมนู                       |

### `orders`
| คอลัมน์      | ประเภท    | คำอธิบาย                              |
|--------------|-----------|-----------------------------------------|
| id           | uuid/int  | primary key                             |
| session_id   | uuid/int  | อ้างอิง `sessions.id`                   |
| table_number | text/int  | หมายเลขโต๊ะ (denormalized เพื่อความเร็ว) |
| items        | jsonb     | รายการสินค้าที่สั่ง                      |
| status       | text      | สถานะออเดอร์                            |
| created_at   | timestamp | เวลาที่สั่ง                              |

## การตั้งค่า Environment Variables

สร้างไฟล์ `.env.local` (ดูตัวอย่างใน `.env.local.example`) และใส่ค่าจาก
Supabase Project Settings > API:

\`\`\`
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
\`\`\`

อย่าลืมตั้งค่าตัวแปรเดียวกันนี้ใน Vercel Project Settings > Environment Variables
ก่อน deploy ด้วย

## การรันโปรเจกต์

\`\`\`bash
npm install
npm run dev
\`\`\`

เปิด http://localhost:3000 เพื่อดูหน้าแรก ซึ่งจะมีลิงก์ไปยัง:
- `/generate-qr` — หน้าสร้าง QR Code สำหรับโต๊ะ (โครงเริ่มต้น)
- `/kitchen` — หน้าจอเคาน์เตอร์/บาริสต้า (โครงเริ่มต้น)

## Deploy บน Vercel

1. Push โค้ดนี้ขึ้น GitHub repository
2. Import repository เข้า Vercel
3. ตั้งค่า Environment Variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) ใน Vercel Project Settings
4. Deploy — Vercel จะรัน `npm run build` และ `npm run start` โดยอัตโนมัติ

## ขั้นตอนถัดไป (ยังไม่รวมในโครงนี้)

- หน้าสั่งชานมของลูกค้าตาม dynamic route ของแต่ละโต๊ะ (ต้องใช้ `use()`
  unwrap `params` ตามหมายเหตุด้านบน)
- ดึงเมนูจริงจากตาราง `menu_categories` / `menu_items` ผ่าน Supabase
- บันทึกออเดอร์ลงตาราง `orders` และเชื่อม realtime กับหน้าเคาน์เตอร์/บาริสต้า
- สร้าง QR Code จริงในหน้า `/generate-qr`
