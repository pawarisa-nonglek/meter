import * as XLSX from 'xlsx';
import { TOUData } from '../types';

export const exportToExcel = (data: TOUData[]) => {
  const MONTHS_TH = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  const excelData = data.map((item, index) => ({
    'ลำดับ': index + 1,
    'วันที่จดหน่วย': item.readingDate ? new Date(item.readingDate).toLocaleDateString('th-TH') : '-',
    'งวดเดือน/ปี': `${MONTHS_TH[parseInt(item.readingMonth) - 1]} ${item.readingYear}`,
    'ชื่อผู้ใช้ไฟฟ้า': item.customerName,
    'หมายเลขผู้ใช้ไฟฟ้า': item.customerNumber,
    'หมายเลขมิเตอร์ PEA': item.peaMeterNumber,
    'จำนวนครั้งที่ RESET': item.resetCount || '-',
    'ผลการตรวจสอบ (111)': item.analysis.sumPeakMatch ? "ถูกต้อง" : "ไม่ตรงกัน",
    '015 vs 050': item.analysis.diff015Match ? "ถูกต้อง" : "ไม่ตรงกัน",
    '016 vs 060': item.analysis.diff016Match ? "ถูกต้อง" : "ไม่ตรงกัน",
    '017 vs 070': item.analysis.diff017Match ? "ถูกต้อง" : "ไม่ตรงกัน",
    '118 vs 280': item.analysis.diff118Match ? "ถูกต้อง" : "ไม่ตรงกัน",
    'วันที่บันทึก': new Date(item.timestamp).toLocaleString('th-TH')
  }));

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "TOU_Report");
  
  // Generate file and download
  XLSX.writeFile(workbook, `tou-report-${new Date().getTime()}.xlsx`);
};
