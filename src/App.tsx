import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Camera, 
  Upload, 
  History, 
  Trash2, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Info, 
  Search,
  ArrowLeft,
  FileText,
  Save,
  Loader2,
  Download,
  Calendar,
  LogIn,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TOUData, TOU_CODES } from './types';
import { exportToExcel } from './utils/exportUtils';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';

import firebaseConfig from '../firebase-applet-config.json';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Firestore Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function AppContent() {
  const [view, setView] = useState<'main' | 'history' | 'detail'>('main');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentData, setCurrentData] = useState<Partial<TOUData> | null>(null);
  const [history, setHistory] = useState<TOUData[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<TOUData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [peaMeterNumber, setPeaMeterNumber] = useState('');
  const [readingMonth, setReadingMonth] = useState<string>(new Date().getMonth() + 1 + '');
  const [readingYear, setReadingYear] = useState<string>((new Date().getFullYear() + 543).toString());
  const [readingDate, setReadingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [resetCount, setResetCount] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState<string>(''); // YYYY-MM
  const [filterYear, setFilterYear] = useState<string>(''); // YYYY
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('TODO')) {
      setLoginError("Firebase configuration is missing or incomplete. Please check firebase-applet-config.json.");
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setHistory([]);
      return;
    }

    const path = 'tou_history';
    const q = query(collection(db, path), orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as TOUData[];
      setHistory(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Test connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  const login = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed", error);
      if (error.code === 'auth/popup-blocked') {
        setLoginError("เบราว์เซอร์ของคุณบล็อกป๊อปอัพ กรุณาอนุญาตป๊อปอัพสำหรับเว็บไซต์นี้");
      } else if (error.code === 'auth/unauthorized-domain') {
        setLoginError("โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Console กรุณาเพิ่มโดเมนนี้ใน Authorized Domains");
      } else {
        setLoginError("เกิดข้อผิดพลาดในการเข้าสู่ระบบ: " + (error.message || "โปรดลองอีกครั้ง"));
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setView('main');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const saveToHistory = async (data: TOUData) => {
    const path = 'tou_history';
    try {
      // Remove id from data before adding to Firestore (Firestore will generate its own ID)
      const { id, ...dataToSave } = data;
      await addDoc(collection(db, path), dataToSave);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteHistoryItem = async (id: string) => {
    const path = `tou_history/${id}`;
    try {
      await deleteDoc(doc(db, 'tou_history', id));
      setDeleteConfirmId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const updateHistoryItem = async (updatedItem: TOUData) => {
    const path = `tou_history/${updatedItem.id}`;
    try {
      const { id, ...dataToUpdate } = updatedItem;
      await updateDoc(doc(db, 'tou_history', id), dataToUpdate);
      setSelectedHistory(updatedItem);
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        processImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async (base64Image: string) => {
    setIsProcessing(true);
    try {
      const base64Data = base64Image.split(',')[1];
      
      const prompt = `
        Analyze this TOU Meter image and extract values for the following codes.
        Codes to look for: 111, 010, 020, 030, 015, 016, 017, 118, 050, 060, 070, 280.
        
        Also, try to extract the following customer information if visible:
        - Customer Name (ชื่อผู้ใช้ไฟฟ้า)
        - Customer Number (หมายเลขผู้ใช้ไฟฟ้า)
        - PEA Meter Number (หมายเลขมิเตอร์ PEA)
        - Number of Resets (จำนวนครั้งที่ RESET)
        
        For codes 015, 016, 017, 118, try to identify both "handwritten" (ลายมือ) and "printed" (พิมพ์) values if present.
        If only one value is present, assume it is the "printed" value unless it clearly looks like handwriting.
        
        Return the data in JSON format:
        {
          "customerInfo": {
            "customerName": "string",
            "customerNumber": "string",
            "peaMeterNumber": "string",
            "resetCount": "string"
          },
          "readings": {
            "CODE": { "value": number, "handwritten": number, "printed": number }
          }
        }
        Only include codes found in the image. Ensure the values are numbers.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      if (result.customerInfo) {
        setCustomerName(result.customerInfo.customerName || '');
        setCustomerNumber(result.customerInfo.customerNumber || '');
        setPeaMeterNumber(result.customerInfo.peaMeterNumber || '');
        setResetCount(result.customerInfo.resetCount || '');
      }
      
      analyzeData(result.readings || {});
    } catch (error) {
      console.error("Error processing image:", error);
      alert("เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsProcessing(false);
    }
  };

  const analyzeData = (readings: any) => {
    const details: string[] = [];
    
    // 1. 111 vs (010 + 020 + 030)
    const val111 = readings["111"]?.value || 0;
    const val010 = readings["010"]?.value || 0;
    const val020 = readings["020"]?.value || 0;
    const val030 = readings["030"]?.value || 0;
    const sumPeak = val010 + val020 + val030;
    const sumPeakMatch = Math.abs(val111 - sumPeak) < 0.01;
    
    if (sumPeakMatch) details.push("ค่า 111 ตรงกับผลรวมของ 010+020+030");
    else details.push(`ค่า 111 (${val111}) ไม่ตรงกับผลรวม (${sumPeak})`);

    // Helper for diff analysis
    const checkDiff = (code: string, targetCode: string) => {
      const hw = readings[code]?.handwritten || readings[code]?.value || 0;
      const pr = readings[code]?.printed || 0;
      const target = readings[targetCode]?.value || 0;
      const diff = Math.abs(hw - pr);
      return { match: Math.abs(diff - target) < 0.01, diff, target };
    };

    const res015 = checkDiff("015", "050");
    const res016 = checkDiff("016", "060");
    const res017 = checkDiff("017", "070");
    const res118 = checkDiff("118", "280");

    setCurrentData({
      readings,
      analysis: {
        sumPeakMatch,
        diff015Match: res015.match,
        diff016Match: res016.match,
        diff017Match: res017.match,
        diff118Match: res118.match,
        details
      }
    });
  };

  const handleSave = () => {
    if (!currentData || !customerName || !customerNumber || !peaMeterNumber) {
      alert("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    const newData: TOUData = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      customerName,
      customerNumber,
      peaMeterNumber,
      readingMonth,
      readingYear,
      readingDate,
      resetCount,
      readings: currentData.readings || {},
      analysis: currentData.analysis as any,
      imageUrl: image || undefined
    };

    saveToHistory(newData);
    alert("บันทึกข้อมูลเรียบร้อยแล้ว");
    resetForm();
  };

  const resetForm = () => {
    setImage(null);
    setCurrentData(null);
    setCustomerName('');
    setCustomerNumber('');
    setPeaMeterNumber('');
    setResetCount('');
    setReadingMonth(new Date().getMonth() + 1 + '');
    setReadingYear((new Date().getFullYear() + 543).toString());
    setReadingDate(new Date().toISOString().split('T')[0]);
  };

  const filteredHistory = history.filter(item => {
    const matchesSearch = 
      item.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.customerNumber.includes(searchQuery) ||
      item.peaMeterNumber.includes(searchQuery);
    
    const matchesMonth = filterMonth ? item.readingMonth === filterMonth : true;
    const matchesYear = filterYear ? item.readingYear === filterYear : true;
    
    return matchesSearch && matchesMonth && matchesYear;
  });

  const MONTHS_TH = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans">
      {/* Navigation */}
      <nav className="bg-white border-b border-[#141414]/10 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center text-white">
              <Camera size={18} />
            </div>
            TOU Meter Reader
          </h1>
          <div className="flex gap-4 items-center">
            {user ? (
              <>
                <button 
                  onClick={() => setView('main')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${view === 'main' ? 'bg-[#141414] text-white' : 'hover:bg-black/5'}`}
                >
                  อ่านหน่วย
                </button>
                <button 
                  onClick={() => setView('history')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${view === 'history' ? 'bg-[#141414] text-white' : 'hover:bg-black/5'}`}
                >
                  ประวัติ
                </button>
                <button 
                  onClick={logout}
                  className="p-2 text-black/40 hover:text-rose-500 transition-colors"
                  title="ออกจากระบบ"
                >
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <button 
                onClick={login}
                disabled={isLoggingIn}
                className={`flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-full text-sm font-medium transition-all ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black/90'}`}
              >
                {isLoggingIn ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <LogIn size={16} />
                )}
                {isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto p-6">
        {!isAuthReady && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="animate-spin text-black/20" size={40} />
            <p className="text-black/40 font-medium">กำลังโหลด...</p>
          </div>
        )}
        {isAuthReady && !user && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-12 shadow-sm border border-black/5 text-center space-y-6"
          >
            <div className="w-20 h-20 bg-[#F5F5F0] rounded-full flex items-center justify-center mx-auto text-black/20">
              <LogIn size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">กรุณาเข้าสู่ระบบ</h2>
              <p className="text-black/40 max-w-xs mx-auto">เข้าสู่ระบบด้วย Google เพื่อซิงค์ข้อมูลและดูประวัติการอ่านมิเตอร์จากทุกอุปกรณ์</p>
            </div>
            {loginError && (
              <div className="bg-rose-50 text-rose-600 p-4 rounded-xl text-sm font-medium flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <p>{loginError}</p>
              </div>
            )}
            <button 
              onClick={login}
              disabled={isLoggingIn}
              className={`w-full bg-[#141414] text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black/90'}`}
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                <>
                  เข้าสู่ระบบด้วย Google
                </>
              )}
            </button>
            <div className="pt-4 border-t border-black/5">
              <p className="text-[10px] text-black/30 leading-relaxed">
                หากกดปุ่มไม่ได้ หรือไม่มีอะไรเกิดขึ้น: <br />
                1. ตรวจสอบว่าเบราว์เซอร์ไม่ได้บล็อกป๊อปอัพ <br />
                2. ตรวจสอบว่าได้เพิ่มโดเมน <span className="font-mono bg-black/5 px-1 rounded">{window.location.hostname}</span> ใน Authorized Domains ของ Firebase แล้ว
              </p>
            </div>
          </motion.div>
        )}
        {isAuthReady && user && (
          <AnimatePresence mode="wait">
          {view === 'main' && (
            <motion.div 
              key="main"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Upload Section */}
              <section className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-2xl p-12 hover:border-black/30 transition-colors cursor-pointer"
                     onClick={() => fileInputRef.current?.click()}>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleImageUpload}
                  />
                  {image ? (
                    <img src={image} alt="Meter" className="max-h-64 rounded-lg shadow-md mb-4" />
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Upload className="text-black/40" />
                      </div>
                      <p className="font-medium">คลิกเพื่ออัปโหลดรูปภาพมิเตอร์</p>
                      <p className="text-sm text-black/40 mt-1">รองรับ JPG, PNG</p>
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="mt-6 flex items-center justify-center gap-3 text-black/60">
                    <Loader2 className="animate-spin" />
                    <p>กำลังประมวลผลด้วย AI...</p>
                  </div>
                )}
              </section>

              {/* Form Section */}
              <div className="grid md:grid-cols-2 gap-8">
                {/* Customer Info Section (Always Visible) */}
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-3xl p-8 shadow-sm border border-black/5 space-y-6"
                >
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <FileText size={20} /> ข้อมูลผู้ใช้ไฟฟ้า
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-black/40 mb-1 block">ชื่อผู้ใช้ไฟฟ้า</label>
                      <input 
                        type="text" 
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full bg-[#F5F5F0] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
                        placeholder="ระบุชื่อ"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-black/40 mb-1 block">หมายเลขผู้ใช้ไฟฟ้า</label>
                      <input 
                        type="text" 
                        value={customerNumber}
                        onChange={(e) => setCustomerNumber(e.target.value)}
                        className="w-full bg-[#F5F5F0] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
                        placeholder="ระบุหมายเลข"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-black/40 mb-1 block">หมายเลขมิเตอร์ PEA</label>
                      <input 
                        type="text" 
                        value={peaMeterNumber}
                        onChange={(e) => setPeaMeterNumber(e.target.value)}
                        className="w-full bg-[#F5F5F0] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
                        placeholder="ระบุหมายเลขมิเตอร์"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-black/40 mb-1 block">จำนวนครั้งที่ RESET</label>
                      <input 
                        type="text" 
                        value={resetCount}
                        onChange={(e) => setResetCount(e.target.value)}
                        className="w-full bg-[#F5F5F0] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
                        placeholder="ระบุจำนวนครั้ง"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-black/40 mb-1 block">ประจำเดือน</label>
                        <select 
                          value={readingMonth}
                          onChange={(e) => setReadingMonth(e.target.value)}
                          className="w-full bg-[#F5F5F0] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
                        >
                          {MONTHS_TH.map((m, i) => (
                            <option key={i+1} value={i+1}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-black/40 mb-1 block">ปี พ.ศ.</label>
                        <select 
                          value={readingYear}
                          onChange={(e) => setReadingYear(e.target.value)}
                          className="w-full bg-[#F5F5F0] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
                        >
                          {Array.from({ length: 5 }).map((_, i) => {
                            const year = new Date().getFullYear() + 543 - i;
                            return <option key={year} value={year.toString()}>{year}</option>;
                          })}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-black/40 mb-1 block">วันที่จดหน่วย</label>
                      <input 
                        type="date" 
                        value={readingDate}
                        onChange={(e) => setReadingDate(e.target.value)}
                        className="w-full bg-[#F5F5F0] border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-black transition-all"
                      />
                    </div>
                  </div>
                </motion.div>

                {/* Analysis Section (Visible after processing) */}
                <AnimatePresence>
                  {currentData && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="bg-white rounded-3xl p-8 shadow-sm border border-black/5 space-y-6"
                    >
                      <h2 className="text-lg font-bold flex items-center gap-2">
                        <Info size={20} /> ผลการวิเคราะห์
                      </h2>
                      
                      {/* Customer Info Summary */}
                      <div className="bg-[#F5F5F0] rounded-2xl p-4 border border-black/5 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">สรุปข้อมูลผู้ใช้ไฟฟ้า</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-black/40">ชื่อผู้ใช้</p>
                            <p className="text-sm font-bold truncate">{customerName || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-black/40">หมายเลขผู้ใช้</p>
                            <p className="text-sm font-bold truncate">{customerNumber || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-black/40">หมายเลขมิเตอร์</p>
                            <p className="text-sm font-bold truncate">{peaMeterNumber || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-black/40">จำนวนครั้งที่ RESET</p>
                            <p className="text-sm font-bold truncate">{resetCount || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-black/40">งวดเดือน/ปี</p>
                            <p className="text-sm font-bold truncate">{MONTHS_TH[parseInt(readingMonth)-1]} {readingYear}</p>
                          </div>
                          <div>
                            <p className="text-xs text-black/40">วันที่จดหน่วย</p>
                            <p className="text-sm font-bold truncate">{new Date(readingDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <AnalysisItem 
                          label="111 vs (010+020+030)" 
                          match={currentData.analysis?.sumPeakMatch} 
                        />
                        <AnalysisItem 
                          label="015 (Diff) vs 050" 
                          match={currentData.analysis?.diff015Match} 
                        />
                        <AnalysisItem 
                          label="016 (Diff) vs 060" 
                          match={currentData.analysis?.diff016Match} 
                        />
                        <AnalysisItem 
                          label="017 (Diff) vs 070" 
                          match={currentData.analysis?.diff017Match} 
                        />
                        <AnalysisItem 
                          label="118 (Diff) vs 280" 
                          match={currentData.analysis?.diff118Match} 
                        />
                      </div>
                      <button 
                        onClick={handleSave}
                        className="w-full bg-[#141414] text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 hover:bg-black/90 transition-all mt-4"
                      >
                        <Save size={20} /> บันทึกข้อมูล
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-black/5 flex items-center gap-3">
                  <Search className="text-black/20" size={20} />
                  <input 
                    type="text" 
                    placeholder="ค้นหาตามชื่อ, หมายเลขผู้ใช้ หรือหมายเลขมิเตอร์..."
                    className="bg-transparent border-none focus:ring-0 w-full text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="flex gap-2">
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-black/5 flex items-center gap-2">
                    <Calendar size={18} className="text-black/20" />
                    <select 
                      className="bg-transparent border-none focus:ring-0 text-sm font-medium pr-8"
                      value={filterMonth}
                      onChange={(e) => {
                        setFilterMonth(e.target.value);
                      }}
                    >
                      <option value="">ทุกเดือน</option>
                      {MONTHS_TH.map((m, i) => (
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-black/5 flex items-center gap-2">
                    <select 
                      className="bg-transparent border-none focus:ring-0 text-sm font-medium pr-8"
                      value={filterYear}
                      onChange={(e) => {
                        setFilterYear(e.target.value);
                      }}
                    >
                      <option value="">ทุกปี</option>
                      {Array.from({ length: 5 }).map((_, i) => {
                        const year = new Date().getFullYear() + 543 - i;
                        return <option key={year} value={year.toString()}>{year}</option>;
                      })}
                    </select>
                  </div>

                  <button 
                    onClick={() => exportToExcel(filteredHistory)}
                    className="bg-emerald-600 text-white rounded-2xl px-6 py-4 font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-sm"
                    title="ดาวน์โหลดรายงาน Excel"
                  >
                    <FileText size={20} />
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-4">
                {filteredHistory.length > 0 ? (
                  filteredHistory.map((item) => (
                    <div 
                      key={item.id}
                      className="bg-white rounded-2xl p-6 shadow-sm border border-black/5 flex items-center justify-between hover:border-black/20 transition-all cursor-pointer group"
                      onClick={() => {
                        setSelectedHistory(item);
                        setView('detail');
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#F5F5F0] rounded-xl flex items-center justify-center text-black/40">
                          <FileText size={24} />
                        </div>
                        <div>
                          <h3 className="font-bold">{item.customerName}</h3>
                          <p className="text-xs text-black/40 uppercase tracking-wider font-medium">
                            {item.customerNumber} • {MONTHS_TH[parseInt(item.readingMonth)-1]} {item.readingYear}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex -space-x-1">
                          {Object.values(item.analysis).slice(0, 3).map((match, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full border border-white ${match ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          ))}
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(item.id);
                          }}
                          className="p-2 text-black/20 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                        <ChevronRight className="text-black/10 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 text-black/40">
                    <History size={48} className="mx-auto mb-4 opacity-20" />
                    <p>ไม่พบข้อมูลประวัติ</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'detail' && selectedHistory && (
            <motion.div 
              key="detail"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-center">
                <button 
                  onClick={() => {
                    setView('history');
                    setIsEditing(false);
                  }}
                  className="flex items-center gap-2 text-sm font-bold text-black/40 hover:text-black transition-colors"
                >
                  <ArrowLeft size={16} /> กลับไปหน้าประวัติ
                </button>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button 
                        onClick={() => setIsEditing(false)}
                        className="px-4 py-2 rounded-full text-sm font-bold border border-black/10 hover:bg-black/5 transition-all"
                      >
                        ยกเลิก
                      </button>
                      <button 
                        onClick={() => {
                          // Trigger update logic
                          const form = document.getElementById('edit-form') as HTMLFormElement;
                          if (form) form.requestSubmit();
                        }}
                        className="px-4 py-2 rounded-full text-sm font-bold bg-[#141414] text-white hover:bg-black/90 transition-all"
                      >
                        บันทึกการแก้ไข
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 rounded-full text-sm font-bold bg-[#141414] text-white hover:bg-black/90 transition-all"
                    >
                      แก้ไขข้อมูล
                    </button>
                  )}
                </div>
              </div>

              <form 
                id="edit-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const updatedReadings = { ...selectedHistory.readings };
                  
                  // Update readings from form
                  TOU_CODES.forEach(code => {
                    if (updatedReadings[code]) {
                      const val = formData.get(`val-${code}`);
                      const hw = formData.get(`hw-${code}`);
                      const pr = formData.get(`pr-${code}`);
                      
                      if (val !== null) updatedReadings[code].value = parseFloat(val as string);
                      if (hw !== null) updatedReadings[code].handwritten = parseFloat(hw as string);
                      if (pr !== null) updatedReadings[code].printed = parseFloat(pr as string);
                    }
                  });

                  const updatedItem: TOUData = {
                    ...selectedHistory,
                    customerName: formData.get('customerName') as string,
                    customerNumber: formData.get('customerNumber') as string,
                    peaMeterNumber: formData.get('peaMeterNumber') as string,
                    resetCount: formData.get('resetCount') as string,
                    readingMonth: formData.get('readingMonth') as string,
                    readingYear: formData.get('readingYear') as string,
                    readingDate: formData.get('readingDate') as string,
                    readings: updatedReadings
                  };
                  updateHistoryItem(updatedItem);
                }}
                className="grid md:grid-cols-3 gap-8"
              >
                <div className="md:col-span-1 space-y-6">
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-black/5">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-black/30 mb-4">รูปภาพมิเตอร์</h3>
                    {selectedHistory.imageUrl ? (
                      <img src={selectedHistory.imageUrl} alt="Meter" className="w-full rounded-2xl shadow-sm" />
                    ) : (
                      <div className="aspect-square bg-[#F5F5F0] rounded-2xl flex items-center justify-center text-black/20">
                        ไม่มีรูปภาพ
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-black/5 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-black/30">ข้อมูลผู้ใช้</h3>
                    {isEditing ? (
                      <div className="space-y-3">
                        <input name="customerName" defaultValue={selectedHistory.customerName} className="w-full text-sm font-bold bg-[#F5F5F0] rounded-lg px-3 py-2 border-none focus:ring-1 focus:ring-black" />
                        <input name="customerNumber" defaultValue={selectedHistory.customerNumber} className="w-full text-sm font-bold bg-[#F5F5F0] rounded-lg px-3 py-2 border-none focus:ring-1 focus:ring-black" />
                        <input name="peaMeterNumber" defaultValue={selectedHistory.peaMeterNumber} className="w-full text-sm font-bold bg-[#F5F5F0] rounded-lg px-3 py-2 border-none focus:ring-1 focus:ring-black" />
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 block">จำนวนครั้งที่ RESET</label>
                          <input name="resetCount" defaultValue={selectedHistory.resetCount} className="w-full text-sm font-bold bg-[#F5F5F0] rounded-lg px-3 py-2 border-none focus:ring-1 focus:ring-black" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select name="readingMonth" defaultValue={selectedHistory.readingMonth} className="w-full text-xs bg-[#F5F5F0] rounded-lg px-2 py-2 border-none focus:ring-1 focus:ring-black">
                            {MONTHS_TH.map((m, i) => (
                              <option key={i+1} value={i+1}>{m}</option>
                            ))}
                          </select>
                          <select name="readingYear" defaultValue={selectedHistory.readingYear} className="w-full text-xs bg-[#F5F5F0] rounded-lg px-2 py-2 border-none focus:ring-1 focus:ring-black">
                            {Array.from({ length: 5 }).map((_, i) => {
                              const year = new Date().getFullYear() + 543 - i;
                              return <option key={year} value={year.toString()}>{year}</option>;
                            })}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1 block">วันที่จดหน่วย</label>
                          <input type="date" name="readingDate" defaultValue={selectedHistory.readingDate} className="w-full text-xs bg-[#F5F5F0] rounded-lg px-2 py-2 border-none focus:ring-1 focus:ring-black" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-bold">{selectedHistory.customerName}</p>
                          <p className="text-xs text-black/40">ชื่อผู้ใช้ไฟฟ้า</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold">{selectedHistory.customerNumber}</p>
                          <p className="text-xs text-black/40">หมายเลขผู้ใช้ไฟฟ้า</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold">{selectedHistory.peaMeterNumber}</p>
                          <p className="text-xs text-black/40">หมายเลขมิเตอร์ PEA</p>
                        </div>
                        <div>
                          <p className="text-sm font-bold">{selectedHistory.resetCount || '-'}</p>
                          <p className="text-xs text-black/40">จำนวนครั้งที่ RESET</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-sm font-bold">{MONTHS_TH[parseInt(selectedHistory.readingMonth)-1]} {selectedHistory.readingYear}</p>
                            <p className="text-xs text-black/40">งวดเดือน/ปี</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold">{new Date(selectedHistory.readingDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            <p className="text-xs text-black/40">วันที่จดหน่วย</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
                    <h3 className="text-lg font-bold mb-6">รายละเอียดการอ่านค่า</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-black/5">
                            <th className="text-left py-4 font-bold text-black/40 uppercase tracking-wider text-[10px]">รหัส (Code)</th>
                            <th className="text-right py-4 font-bold text-black/40 uppercase tracking-wider text-[10px]">ค่าที่อ่านได้</th>
                            <th className="text-right py-4 font-bold text-black/40 uppercase tracking-wider text-[10px]">ลายมือ</th>
                            <th className="text-right py-4 font-bold text-black/40 uppercase tracking-wider text-[10px]">พิมพ์</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {TOU_CODES.map(code => {
                            const data = selectedHistory.readings[code];
                            if (!data) return null;
                            return (
                              <tr key={code} className="group hover:bg-[#F5F5F0]/50 transition-colors">
                                <td className="py-4 font-mono font-bold">{code}</td>
                                <td className="py-4 text-right font-mono">
                                  {isEditing ? (
                                    <input type="number" step="0.001" name={`val-${code}`} defaultValue={data.value} className="w-20 text-right bg-[#F5F5F0] rounded px-2 py-1 border-none text-xs" />
                                  ) : (
                                    data.value?.toFixed(3) || '-'
                                  )}
                                </td>
                                <td className="py-4 text-right font-mono">
                                  {isEditing ? (
                                    <input type="number" step="0.001" name={`hw-${code}`} defaultValue={data.handwritten} className="w-20 text-right bg-[#F5F5F0] rounded px-2 py-1 border-none text-xs" />
                                  ) : (
                                    data.handwritten?.toFixed(3) || '-'
                                  )}
                                </td>
                                <td className="py-4 text-right font-mono">
                                  {isEditing ? (
                                    <input type="number" step="0.001" name={`pr-${code}`} defaultValue={data.printed} className="w-20 text-right bg-[#F5F5F0] rounded px-2 py-1 border-none text-xs" />
                                  ) : (
                                    data.printed?.toFixed(3) || '-'
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
                    <h3 className="text-lg font-bold mb-6">สรุปผลการตรวจสอบ</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <AnalysisCard label="111 Match" match={selectedHistory.analysis.sumPeakMatch} />
                      <AnalysisCard label="015 vs 050" match={selectedHistory.analysis.diff015Match} />
                      <AnalysisCard label="016 vs 060" match={selectedHistory.analysis.diff016Match} />
                      <AnalysisCard label="017 vs 070" match={selectedHistory.analysis.diff017Match} />
                      <AnalysisCard label="118 vs 280" match={selectedHistory.analysis.diff118Match} />
                    </div>
                  </div>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500">
                <Trash2 size={32} />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold">ยืนยันการลบข้อมูล?</h3>
                <p className="text-black/40 text-sm">คุณแน่ใจหรือไม่ว่าต้องการลบประวัตินี้? ข้อมูลที่ลบแล้วจะไม่สามารถกู้คืนได้</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold border border-black/10 hover:bg-black/5 transition-all"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={() => deleteHistoryItem(deleteConfirmId)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-rose-500 text-white hover:bg-rose-600 transition-all"
                >
                  ลบข้อมูล
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return <AppContent />;
}

function AnalysisItem({ label, match }: { label: string, match?: boolean }) {
  if (match === undefined) return null;
  return (
    <div className="flex items-center justify-between p-3 bg-[#F5F5F0] rounded-xl">
      <span className="text-sm font-medium">{label}</span>
      {match ? (
        <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs">
          <CheckCircle2 size={14} /> ถูกต้อง
        </div>
      ) : (
        <div className="flex items-center gap-1 text-rose-600 font-bold text-xs">
          <XCircle size={14} /> ไม่ตรงกัน
        </div>
      )}
    </div>
  );
}

function AnalysisCard({ label, match }: { label: string, match: boolean }) {
  return (
    <div className={`p-4 rounded-2xl border ${match ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-black/40 mb-2">{label}</p>
      <div className="flex items-center gap-2">
        {match ? (
          <>
            <CheckCircle2 className="text-emerald-500" size={20} />
            <span className="font-bold text-emerald-700">ผ่านการตรวจสอบ</span>
          </>
        ) : (
          <>
            <XCircle className="text-rose-500" size={20} />
            <span className="font-bold text-rose-700">ไม่ผ่านการตรวจสอบ</span>
          </>
        )}
      </div>
    </div>
  );
}
