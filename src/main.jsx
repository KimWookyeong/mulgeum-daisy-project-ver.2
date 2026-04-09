import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  MapPin, 
  BarChart3, 
  PlusCircle, 
  List, 
  Navigation, 
  X, 
  User, 
  AlertTriangle, 
  Camera, 
  ChevronRight, 
  Trash2, 
  LogOut, 
  Loader2,
  ShieldCheck,
  Flower2
} from 'lucide-react';

/**
 * [물금동아 데이지 프로젝트 - 관리자 모드 및 인증 오류 최종 해결본]
 * 1. 관리자 지도 로딩: nickname 변경 시 지도 초기화 로직 연동
 * 2. 삭제/초기화 실패 해결: Firebase auth.currentUser 실시간 체크 및 강제 인증
 * 3. 디자인: 흰색 꽃잎 시인성 개선 (테두리 및 그림자)
 */

const firebaseConfig = {
  apiKey: "AIzaSyBYfwtdXjz4ekJbH83merNVPZemb_bc3NE",
  authDomain: "fourseason-run-and-map.firebaseapp.com",
  projectId: "fourseason-run-and-map",
  storageBucket: "fourseason-run-and-map.firebasestorage.app",
  messagingSenderId: "671510183044",
  appId: "1:671510183044:web:59ad0cc29cf6bd98f3d6d1",
  databaseURL: "https://fourseason-run-and-map-default-rtdb.firebaseio.com/" 
};

// 고유 앱 아이디 (데이터 꼬임 방지를 위해 v5로 업데이트)
const appId = 'mulgeum-daisy-advanced-final-v5'; 
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TRASH_CATEGORIES = [
  { id: 'cup', label: '일회용 컵', color: '#fbbf24', icon: '🥤' },
  { id: 'smoke', label: '담배꽁초', color: '#78350f', icon: '🚬' },
  { id: 'plastic', label: '플라스틱/비닐', color: '#3b82f6', icon: '🛍️' },
  { id: 'bulky', label: '대형 폐기물', color: '#4b5563', icon: '📦' },
  { id: 'etc', label: '기타 쓰레기', color: '#9ca3af', icon: '❓' },
];

const AREAS = ["물금읍", "증산리", "가촌리", "범어리", "기타 구역"];
const INITIAL_CENTER = [35.327, 129.007]; 

// 디자인 개선된 데이지 꽃 글자
const DaisyLetter = ({ letter }) => (
  <div className="relative inline-flex items-center justify-center w-[42px] h-[42px] mx-[1px] align-middle">
    <svg viewBox="0 0 100 100" className="absolute w-full h-full drop-shadow-md">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <ellipse 
          key={angle} 
          cx="50" cy="25" rx="12" ry="25" 
          fill="white" 
          stroke="#fde68a" 
          strokeWidth="2"
          transform={`rotate(${angle} 50 50)`} 
        />
      ))}
      <circle cx="50" cy="50" r="18" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
    </svg>
    <span className="relative z-10 font-black text-[15px] text-[#451a03] mt-[1px]">{letter}</span>
  </div>
);

const App = () => {
  const [user, setUser] = useState(null);
  const [nickname, setNickname] = useState(localStorage.getItem('team_nickname') || '');
  const [isSettingNickname, setIsSettingNickname] = useState(!localStorage.getItem('team_nickname'));
  const [activeTab, setActiveTab] = useState('map');
  const [reports, setReports] = useState([]);
  const [isLocating, setIsLocating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const mapContainerRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef({});
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  const [formData, setFormData] = useState({
    category: 'cup', area: AREAS[0], description: '', status: 'pending', customLocation: null, image: null
  });

  const isAdmin = nickname.toLowerCase() === 'admin';

  // 이미지 압축
  const compressImage = (base64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.6)); }
      };
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      if (typeof event.target?.result === 'string') {
        const compressed = await compressImage(event.target.result);
        setFormData(prev => ({ ...prev, image: compressed }));
      }
    };
    reader.readAsDataURL(file);
  };

  // 1. 인증 초기화
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth.currentUser) await signInAnonymously(auth);
      } catch (err) { console.error("인증 실패:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 실시간 데이터 수신
  useEffect(() => {
    const currentUser = user || auth.currentUser;
    if (!currentUser) return;

    const reportsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'reports');
    const unsubscribe = onSnapshot(reportsCollection, (snapshot) => {
      const formatted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => new Date(b.discoveredTime).getTime() - new Date(a.discoveredTime).getTime());
      setReports(formatted);
      updateMarkers(formatted);
    }, (err) => console.error("데이터 수신 오류:", err));
    return () => unsubscribe();
  }, [user, nickname]);

  // 3. 지도 라이브러리 로드
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true; script.onload = () => setIsScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  // 4. 지도 초기화 및 크기 보정 (관리자 모드 대응)
  useEffect(() => {
    if (isScriptLoaded && !isSettingNickname && activeTab === 'map' && mapContainerRef.current) {
      if (!leafletMap.current) {
        setTimeout(() => {
          if (!mapContainerRef.current) return;
          leafletMap.current = window.L.map(mapContainerRef.current, { 
            zoomControl: false, attributionControl: false 
          }).setView(INITIAL_CENTER, 14);
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap.current);
          updateMarkers(reports);
        }, 600);
      } else { 
        setTimeout(() => { if (leafletMap.current) leafletMap.current.invalidateSize(); }, 400);
      }
    }
  }, [isScriptLoaded, activeTab, isSettingNickname, nickname]); // nickname 추가로 관리자 로그인 대응

  const updateMarkers = (data) => {
    if (!window.L || !leafletMap.current) return;
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};
    data.forEach(report => {
      if (!report.location) return;
      const cat = TRASH_CATEGORIES.find(c => c.id === report.category) || TRASH_CATEGORIES[4];
      const pinColor = isAdmin ? '#ef4444' : (report.userName === nickname ? '#fbbf24' : '#fff');
      const iconHtml = `<div style="background-color:${cat.color}; width:30px; height:30px; border-radius:10px; border:2px solid ${pinColor}; display:flex; align-items:center; justify-content:center; font-size:16px; transform:rotate(45deg); box-shadow: 0 4px 12px rgba(0,0,0,0.15);"><div style="transform:rotate(-45deg)">${cat.icon}</div></div>`;
      const icon = window.L.divIcon({ html: iconHtml, className: 'custom-pin', iconSize: [30, 30], iconAnchor: [15, 15] });
      const marker = window.L.marker([report.location.lat, report.location.lng], { icon }).addTo(leafletMap.current);
      marker.bindPopup(`<b>${cat.icon} ${cat.label}</b><br/><small>활동가: ${report.userName}</small>`);
      markersRef.current[report.id] = marker;
    });
  };

  const handleLogout = () => {
    if (window.confirm("로그아웃하시겠습니까?")) {
      localStorage.removeItem('team_nickname');
      setNickname('');
      setIsSettingNickname(true);
      if(leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
      signOut(auth);
    }
  };

  const getGPS = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setFormData(prev => ({ ...prev, customLocation: coords }));
        setIsLocating(false);
        if (leafletMap.current) leafletMap.current.setView([coords.lat, coords.lng], 16);
      },
      () => { setIsLocating(false); alert("GPS 수신 실패. 지도의 중심점이 기록됩니다."); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    let currentAuthUser = auth.currentUser || user;
    if (!currentAuthUser) {
      try { const cred = await signInAnonymously(auth); currentAuthUser = cred.user; }
      catch (err) { return alert("인증 오류가 발생했습니다."); }
    }

    setIsUploading(true);
    try {
      const center = leafletMap.current ? leafletMap.current.getCenter() : { lat: INITIAL_CENTER[0], lng: INITIAL_CENTER[1] };
      const loc = formData.customLocation || { lat: center.lat, lng: center.lng };
      const coll = collection(db, 'artifacts', appId, 'public', 'data', 'reports');
      await addDoc(coll, { ...formData, location: loc, userName: nickname, discoveredTime: new Date().toISOString() });
      setFormData({ category: 'cup', area: AREAS[0], description: '', status: 'pending', customLocation: null, image: null });
      setActiveTab('map');
      alert("성공적으로 업로드되었습니다! 🌼");
    } catch (err) { alert("업로드 실패!"); } finally { setIsUploading(false); }
  };

  // 개별 삭제 (관리자 기능 강화)
  const handleDelete = async (reportId) => {
    if (!isAdmin && !window.confirm("본인의 기록을 삭제하시겠습니까?")) return;
    if (isAdmin && !window.confirm("관리자 권한으로 이 기록을 삭제하시겠습니까?")) return;

    try {
      // 삭제 시에도 인증 체크 필수 (Rule 3)
      if (!auth.currentUser) await signInAnonymously(auth);
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', reportId));
      alert("기록이 삭제되었습니다.");
    } catch (err) { alert("삭제 실패: 권한이 없거나 네트워크 오류입니다."); }
  };

  // 전체 데이터 초기화 (관리자 전용)
  const clearAllData = async () => {
    if (!isAdmin) return;
    if (window.confirm("🚨 경고: 관리자 권한으로 모든 활동 기록을 영구 삭제하시겠습니까?")) {
      try {
        if (!auth.currentUser) await signInAnonymously(auth);
        const coll = collection(db, 'artifacts', appId, 'public', 'data', 'reports');
        const snapshot = await getDocs(coll);
        const batch = writeBatch(db);
        snapshot.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        alert("모든 기록이 깨끗하게 초기화되었습니다.");
      } catch (err) { alert("초기화 실패: " + err.message); }
    }
  };

  if (isSettingNickname) {
    return (
      <div className="fixed inset-0 bg-[#fefce8] flex flex-col items-center justify-center p-5 z-[9999]">
        <div className="mb-10 text-center">
          <div className="bg-[#fbbf24] w-[70px] h-[70px] rounded-[24px] flex items-center justify-center mx-auto mb-6 shadow-lg -rotate-6">
            <Flower2 size={40} color="white" />
          </div>
          <h1 className="text-4xl font-black text-[#92400e] mb-5 tracking-tight">물금동아</h1>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <DaisyLetter letter="데" /><span className="text-sm font-extrabold text-[#78350f]">이터를</span>
            <DaisyLetter letter="이" /><span className="text-sm font-extrabold text-[#78350f]">용한</span>
            <DaisyLetter letter="지" /><span className="text-sm font-extrabold text-[#78350f]">역 쓰레기 해결</span>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[40px] w-full max-w-[360px] text-center shadow-xl border border-yellow-100">
          <h2 className="text-xl font-black text-[#78350f] mb-2">반가워요 활동가님!</h2>
          <p className="text-sm text-[#92400e] opacity-70 mb-8">실시간 지도에 합류하기 위해<br/>학번과 이름을 입력해 주세요.</p>
          <form onSubmit={(e) => { e.preventDefault(); if(nickname.trim()){ localStorage.setItem('team_nickname', nickname); setIsSettingNickname(false); } }}>
            <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="예: 30101_홍길동" className="w-full p-4 rounded-2xl bg-[#fefce8] border-2 border-[#fde68a] text-center font-bold text-lg mb-6 outline-none focus:border-yellow-400 transition-all" autoFocus />
            <button type="submit" className="w-full bg-[#fbbf24] text-white font-black rounded-2xl p-4 text-lg shadow-md flex items-center justify-center gap-2 active:scale-95 transition-transform">프로젝트 합류하기 <ChevronRight size={22}/></button>
          </form>
        </div>
      </div>
    );
  }

  const solvedCount = reports.filter(r => r.status === 'solved').length;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#fefce8] font-sans">
      <header className="h-[65px] bg-white border-b border-[#fde68a] flex items-center justify-between px-5 z-[1000]">
        <div className="flex items-center gap-2">
          <Flower2 size={18} color="#fbbf24" />
          <span className="text-sm font-black text-[#92400e]">물금동아 데이지</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${isAdmin ? 'bg-red-50 text-red-500 border-red-200' : 'bg-yellow-50 text-[#b45309] border-yellow-200'}`}>{nickname}</span>
          <button onClick={handleLogout} className="p-2 bg-[#fefce8] rounded-xl text-[#b45309] active:scale-90 transition-transform"><LogOut size={16}/></button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden">
        {/* Tab 1: 지도 */}
        <div className={`absolute inset-0 z-10 ${activeTab === 'map' ? 'visible' : 'hidden'}`}>
          <div ref={mapContainerRef} className="w-full h-full" />
          <button onClick={() => setActiveTab('add')} className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#78350f] text-white font-black px-10 py-4 rounded-full z-[1001] shadow-2xl active:scale-95 transition-transform">기록하기 +</button>
        </div>

        {/* Tab 2: 추가 */}
        <div className={`absolute inset-0 bg-[#fefce8] p-6 overflow-y-auto z-[2000] transition-transform duration-300 ${activeTab === 'add' ? 'translate-y-0' : 'translate-y-full'}`}>
           <div className="flex justify-between items-center mb-6">
             <h2 className="text-2xl font-black text-[#78350f]">NEW RECORD</h2>
             <button onClick={() => setActiveTab('map')} className="p-2 bg-white rounded-xl shadow-sm"><X size={20}/></button>
           </div>
           <form onSubmit={handleSave} className="flex flex-col gap-4">
             <div className="grid grid-cols-2 gap-3">
               <button type="button" onClick={getGPS} className="h-24 rounded-3xl bg-[#78350f] text-white flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
                 <MapPin size={24} color={formData.customLocation ? "#fbbf24" : "white"} />
                 <span className="text-[10px] font-black">{isLocating ? "수신 중..." : formData.customLocation ? "위치 완료" : "내 위치 찾기"}</span>
               </button>
               <label className="h-24 rounded-3xl bg-white border-2 border-dashed border-[#fde68a] flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden active:scale-95 transition-transform">
                 <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                 {formData.image ? <img src={formData.image} className="w-full h-full object-cover" /> : <><Camera size={24} color="#fbbf24"/><span className="text-[10px] font-black text-[#fbbf24]">사진 추가</span></>}
               </label>
             </div>
             <select value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} className="p-4 rounded-2xl border-2 border-[#fde68a] font-bold outline-none">
               {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
             </select>
             <div className="grid grid-cols-2 gap-2">
               {TRASH_CATEGORIES.map(c => (
                 <button key={c.id} type="button" onClick={() => setFormData({...formData, category: c.id})} className={`p-4 rounded-2xl border-2 flex items-center gap-2 transition-all ${formData.category === c.id ? 'border-[#fbbf24] bg-white shadow-inner' : 'border-transparent bg-white'}`}>
                   <span className="text-lg">{c.icon}</span><span className="text-[11px] font-black">{c.label}</span>
                 </button>
               ))}
             </div>
             <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="상황을 입력해 주세요." className="p-5 rounded-3xl h-32 border-2 border-[#fde68a] outline-none resize-none" />
             <button disabled={isUploading} className="bg-[#fbbf24] text-white p-5 rounded-[25px] font-black text-lg shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform">
               {isUploading ? <Loader2 className="animate-spin" size={20}/> : "지도에 업로드"}
             </button>
           </form>
        </div>

        {/* Tab 3: 아카이브 */}
        <div className={`absolute inset-0 bg-[#fefce8] p-6 overflow-y-auto ${activeTab === 'list' ? 'visible' : 'hidden'}`}>
           <h2 className="text-2xl font-black text-[#78350f] mb-6">TEAM ARCHIVE</h2>
           {reports.length === 0 ? <div className="text-center py-20 text-[#d97706] font-bold opacity-40">기록이 없습니다.</div> : reports.map(r => (
             <div key={r.id} className="bg-white p-5 rounded-[32px] mb-4 border border-[#fde68a] shadow-sm animate-in fade-in slide-in-from-bottom-2">
               <div className="flex justify-between items-center mb-4">
                 <span className="text-sm font-black text-[#78350f] flex items-center gap-1">{TRASH_CATEGORIES.find(c => c.id === r.category)?.icon} {r.area}</span>
                 <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', r.id), { status: r.status === 'pending' ? 'solved' : 'pending' })} className={`text-[10px] font-black px-3 py-1 rounded-full ${r.status === 'solved' ? 'bg-[#fbbf24] text-white' : 'bg-yellow-50 text-[#b45309]'}`}>{r.status === 'solved' ? '해결됨 ✓' : '진행중'}</button>
               </div>
               {r.image && <img src={r.image} className="w-full h-48 object-cover rounded-3xl mb-4" />}
               <p className="text-sm text-[#451a03] leading-relaxed mb-4 font-medium px-1">{r.description || "내용 없음"}</p>
               <div className="flex justify-between items-center pt-3 border-t border-yellow-50">
                 <span className="text-[11px] text-[#92400e] font-black opacity-60 flex items-center gap-1"><User size={12}/> {r.userName}</span>
                 {(r.userName === nickname || isAdmin) && <button onClick={() => handleDelete(r.id)} className="p-1 text-red-300 hover:text-red-500 active:scale-90 transition-all"><Trash2 size={18}/></button>}
               </div>
             </div>
           ))}
        </div>

        {/* Tab 4: 통계 */}
        <div className={`absolute inset-0 bg-[#fefce8] p-6 overflow-y-auto ${activeTab === 'stats' ? 'visible' : 'hidden'}`}>
           <h2 className="text-2xl font-black text-[#78350f] mb-6">ACTIVITY STATS</h2>
           <div className="bg-[#78350f] p-10 rounded-[40px] text-center mb-5 shadow-xl">
              <h3 className="text-5xl font-black text-white mb-1">{solvedCount}</h3>
              <p className="text-xs font-black text-[#fbbf24] tracking-widest opacity-80 uppercase">Cleaned Up!</p>
           </div>
           <div className="grid grid-cols-2 gap-4 mb-10">
              <div className="bg-white p-6 rounded-[30px] text-center border border-yellow-100 shadow-sm"><p className="text-[10px] font-black text-[#92400e] opacity-50 mb-1 uppercase">Total Found</p><p className="text-2xl font-black text-[#78350f]">{reports.length}</p></div>
              <div className="bg-white p-6 rounded-[30px] text-center border border-yellow-100 shadow-sm"><p className="text-[10px] font-black text-[#92400e] opacity-50 mb-1 uppercase">Success Rate</p><p className="text-2xl font-black text-[#fbbf24]">{reports.length > 0 ? Math.round((solvedCount/reports.length)*100) : 0}%</p></div>
           </div>

           {isAdmin && (
              <div className="bg-white p-8 rounded-[40px] border-2 border-dashed border-red-200 text-center shadow-md animate-pulse">
                 <h4 className="text-red-500 font-black mb-2 flex items-center justify-center gap-2"><AlertTriangle size={20}/> ADMIN TOOLS</h4>
                 <p className="text-xs text-[#92400e] opacity-60 mb-6 font-bold">관리자 권한으로 전체 데이터를<br/>영구히 삭제할 수 있습니다.</p>
                 <button onClick={clearAllData} className="w-full bg-red-500 text-white p-4 rounded-2xl font-black shadow-lg active:scale-95 transition-transform">모든 데이터 초기화</button>
              </div>
           )}
        </div>
      </main>

      <nav className="h-[75px] bg-white border-t border-[#fde68a] flex justify-around items-center px-2 pb-2">
        <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'map' ? 'text-[#fbbf24]' : 'text-gray-300'}`}>
          <MapPin size={24} fill={activeTab === 'map' ? 'currentColor' : 'none'} strokeWidth={3}/>
          <span className="text-[10px] font-black">지도</span>
        </button>
        <button onClick={() => setActiveTab('list')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'list' ? 'text-[#fbbf24]' : 'text-gray-300'}`}>
          <List size={24} strokeWidth={3}/>
          <span className="text-[10px] font-black">피드</span>
        </button>
        <button onClick={() => setActiveTab('stats')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'stats' ? 'text-[#fbbf24]' : 'text-gray-300'}`}>
          <BarChart3 size={24} strokeWidth={3}/>
          <span className="text-[10px] font-black">통계</span>
        </button>
      </nav>
      <style>{`
        .leaflet-container { background: #fefce8 !important; z-index: 1 !important; }
        .custom-pin { background: none !important; border: none !important; }
        ::-webkit-scrollbar { width: 0px; }
      `}</style>
    </div>
  );
};

export default App;