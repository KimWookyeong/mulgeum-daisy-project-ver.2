import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
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
 * [물금동아 데이지 프로젝트 - 관리자 모드 및 기능 완전 복구본]
 * 1. 해결: 관리자 로그인 시 지도 안 뜨는 현상 (렌더링 타이밍 수정)
 * 2. 해결: 개별 기록 삭제 및 전체 데이터 초기화 에러 (인증 가드 추가)
 * 3. 디자인: 데이지 꽃 시인성 개선 테두리 유지
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

// Firestore 규칙 준수를 위한 고유 앱 아이디
const appId = 'mulgeum-daisy-advanced-final-v3'; 
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

// 디자인 개선된 데이지 꽃 글자 디자인
const DaisyLetter = ({ letter }) => (
  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '42px', height: '42px', margin: '0 1px', verticalAlign: 'middle' }}>
    <svg viewBox="0 0 100 100" style={{ position: 'absolute', width: '100%', height: '100%', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.1))' }}>
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
    <span style={{ position: 'relative', zIndex: 1, fontWeight: '900', fontSize: '15px', color: '#451a03', marginTop: '1px' }}>{letter}</span>
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

  // 이미지 압축 로직
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

  // 1. 인증 초기화 (Rule 3 준수)
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("인증 실패:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // 2. 데이터 실시간 수신 (Rule 1 & 3 준수)
  useEffect(() => {
    if (!user) return;
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

  // 4. 지도 초기화 및 크기 보정 (중요: admin 로그인 직후 지도가 안 뜨는 문제 해결)
  useEffect(() => {
    if (isScriptLoaded && !isSettingNickname && activeTab === 'map' && mapContainerRef.current) {
      if (!leafletMap.current) {
        // DOM이 안정화된 후 지도를 생성하기 위해 약간 더 긴 지연 시간을 줌
        setTimeout(() => {
          if (!mapContainerRef.current) return;
          leafletMap.current = window.L.map(mapContainerRef.current, { 
            zoomControl: false, 
            attributionControl: false 
          }).setView(INITIAL_CENTER, 14);
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap.current);
          updateMarkers(reports);
        }, 600);
      } else { 
        // 탭 전환 시 지도가 깨지는 현상 방지
        setTimeout(() => {
          if (leafletMap.current) leafletMap.current.invalidateSize();
        }, 400);
      }
    }
  }, [isScriptLoaded, activeTab, isSettingNickname]);

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
    if (!user) return alert("인증 처리 중입니다. 잠시만 기다려주세요.");
    setIsUploading(true);
    try {
      const center = leafletMap.current ? leafletMap.current.getCenter() : { lat: INITIAL_CENTER[0], lng: INITIAL_CENTER[1] };
      const loc = formData.customLocation || { lat: center.lat, lng: center.lng };
      const coll = collection(db, 'artifacts', appId, 'public', 'data', 'reports');
      await addDoc(coll, { ...formData, location: loc, userName: nickname, discoveredTime: new Date().toISOString() });
      setFormData({ category: 'cup', area: AREAS[0], description: '', status: 'pending', customLocation: null, image: null });
      setActiveTab('map');
      alert("지도에 업로드되었습니다! 🌼");
    } catch (err) { alert("업로드 실패!"); } finally { setIsUploading(false); }
  };

  // 개별 삭제 기능 수정 (Rule 3 준수)
  const handleDelete = async (reportId) => {
    if (!user) return;
    if (window.confirm("이 기록을 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', reportId));
        alert("기록이 삭제되었습니다.");
      } catch (err) {
        alert("삭제에 실패했습니다: " + err.message);
      }
    }
  };

  // 전체 초기화 기능 수정 (Rule 3 준수)
  const clearAllData = async () => {
    if (!isAdmin || !user) return;
    if (window.confirm("🚨 경고: 모든 활동 기록이 영구 삭제됩니다. 계속하시겠습니까?")) {
      try {
        const coll = collection(db, 'artifacts', appId, 'public', 'data', 'reports');
        const snapshot = await getDocs(coll);
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        alert("모든 기록이 초기화되었습니다.");
      } catch (err) { 
        alert("초기화 실패: " + err.message); 
      }
    }
  };

  if (isSettingNickname) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: '#fefce8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 9999 }}>
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <div style={{ backgroundColor: '#fbbf24', width: '70px', height: '70px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 25px', transform: 'rotate(-5deg)', boxShadow: '0 10px 25px rgba(251,191,36,0.2)' }}>
            <Flower2 size={40} color="white" />
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#92400e', margin: '0 0 20px 0', letterSpacing: '-0.02em' }}>물금동아</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '2px', lineHeight: '1.2' }}>
            <div style={{display:'flex', alignItems:'center'}}>
              <DaisyLetter letter="데" /><span style={{ fontSize: '14px', fontWeight: '800', color: '#78350f' }}>이터를</span>
            </div>
            <div style={{display:'flex', alignItems:'center'}}>
              <DaisyLetter letter="이" /><span style={{ fontSize: '14px', fontWeight: '800', color: '#78350f' }}>용한</span>
            </div>
            <div style={{display:'flex', alignItems:'center'}}>
              <DaisyLetter letter="지" /><span style={{ fontSize: '14px', fontWeight: '800', color: '#78350f' }}>역 쓰레기 해결</span>
            </div>
          </div>
        </div>
        <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '40px', width: '100%', maxWidth: '360px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#78350f', marginBottom: '8px' }}>반가워요 활동가님!</h2>
          <p style={{ fontSize: '0.85rem', color: '#92400e', marginBottom: '24px', opacity: 0.7 }}>실시간 지도에 합류하기 위해<br/>학번과 이름을 입력해 주세요.</p>
          <form onSubmit={(e) => { e.preventDefault(); if(nickname.trim()){ localStorage.setItem('team_nickname', nickname); setIsSettingNickname(false); } }}>
            <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="예: 30101_홍길동" style={{ width: '100%', padding: '16px', borderRadius: '20px', backgroundColor: '#fefce8', border: '2px solid #fde68a', textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '24px', outline: 'none' }} autoFocus />
            <button type="submit" style={{ width: '100%', backgroundColor: '#fbbf24', color: 'white', border: 'none', fontWeight: '900', borderRadius: '20px', padding: '18px', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>프로젝트 합류하기 <ChevronRight size={22}/></button>
          </form>
        </div>
      </div>
    );
  }

  const solvedCount = reports.filter(r => r.status === 'solved').length;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#fefce8', fontFamily: '-apple-system, sans-serif' }}>
      <header style={{ height: '65px', backgroundColor: 'white', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Flower2 size={18} color="#fbbf24" />
          <span style={{ fontSize: '14px', fontWeight: '900', color: '#92400e' }}>물금동아 데이지</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ backgroundColor: isAdmin ? '#fee2e2' : '#fffbeb', color: isAdmin ? '#ef4444' : '#b45309', fontWeight: '900', fontSize: '10px', padding: '4px 12px', borderRadius: '20px', border: '1px solid #fde68a' }}>{nickname}</span>
          <button onClick={handleLogout} style={{ border: 'none', background: '#fefce8', padding: '8px', borderRadius: '10px', color: '#b45309', cursor: 'pointer' }}><LogOut size={16}/></button>
        </div>
      </header>

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Tab 1: 지도 */}
        <div style={{ position: 'absolute', inset: 0, visibility: activeTab === 'map' ? 'visible' : 'hidden', zIndex: 1 }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          <button onClick={() => setActiveTab('add')} style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#78350f', color: 'white', border: 'none', fontWeight: '900', borderRadius: '30px', padding: '15px 35px', zIndex: 1001, boxShadow: '0 4px 15px rgba(0,0,0,0.3)', cursor: 'pointer' }}>기록하기 +</button>
        </div>

        {/* Tab 2: 추가 (오버레이) */}
        <div style={{ position: 'absolute', inset: 0, backgroundColor: '#fefce8', transform: activeTab === 'add' ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.4s ease', padding: '24px', overflowY: 'auto', zIndex: 2000 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
             <h2 style={{ fontWeight: '900', color: '#78350f', margin: 0 }}>NEW RECORD</h2>
             <button onClick={() => setActiveTab('map')} style={{ border: 'none', background: 'white', padding: '8px', borderRadius: '12px', cursor: 'pointer' }}><X/></button>
           </div>
           <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
               <button type="button" onClick={getGPS} style={{ height: '100px', borderRadius: '24px', backgroundColor: '#78350f', color: 'white', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                 <MapPin size={24} color={formData.customLocation ? "#fbbf24" : "white"} />
                 <span style={{ fontSize: '10px', fontWeight: '900' }}>{isLocating ? "수신 중..." : formData.customLocation ? "위치 완료" : "내 위치 찾기"}</span>
               </button>
               <label style={{ height: '100px', borderRadius: '24px', backgroundColor: 'white', border: '2px dashed #fde68a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', overflow: 'hidden' }}>
                 <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                 {formData.image ? <img src={formData.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <><Camera size={24} color="#fbbf24"/><span style={{ fontSize: '10px', fontWeight: '900', color: '#fbbf24' }}>사진 추가</span></>}
               </label>
             </div>
             <select value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} style={{ padding: '16px', borderRadius: '15px', border: '2px solid #fde68a', backgroundColor: 'white', fontWeight: 'bold', outline: 'none' }}>
               {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
             </select>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
               {TRASH_CATEGORIES.map(c => (
                 <button key={c.id} type="button" onClick={() => setFormData({...formData, category: c.id})} style={{ padding: '14px', borderRadius: '15px', border: '2px solid', borderColor: formData.category === c.id ? '#fbbf24' : 'transparent', background: 'white', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                   <span>{c.icon}</span><span style={{ fontSize: '11px' }}>{c.label}</span>
                 </button>
               ))}
             </div>
             <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="상황을 입력해 주세요." style={{ padding: '18px', borderRadius: '15px', height: '100px', border: '2px solid #fde68a', outline: 'none', resize: 'none' }} />
             <button disabled={isUploading} style={{ backgroundColor: '#fbbf24', color: 'white', padding: '18px', borderRadius: '20px', border: 'none', fontWeight: '900', fontSize: '1.1rem', cursor: isUploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
               {isUploading ? <Loader2 className="animate-spin" size={20}/> : "지도에 업로드"}
             </button>
           </form>
        </div>

        {/* Tab 3: 아카이브 */}
        <div style={{ position: 'absolute', inset: 0, backgroundColor: '#fefce8', visibility: activeTab === 'list' ? 'visible' : 'hidden', opacity: activeTab === 'list' ? 1 : 0, transition: 'opacity 0.3s', padding: '24px', overflowY: 'auto' }}>
           <h2 style={{ fontWeight: '900', color: '#78350f', marginBottom: '24px' }}>TEAM ARCHIVE</h2>
           {reports.length === 0 ? <div style={{ textAlign: 'center', padding: '40px', color: '#d97706', opacity: 0.6 }}>기록이 없습니다.</div> : reports.map(r => (
             <div key={r.id} style={{ background: 'white', padding: '20px', borderRadius: '24px', marginBottom: '16px', border: '1px solid #fde68a', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                 <span style={{ fontWeight: '900', color: '#78350f', fontSize: '14px' }}>{TRASH_CATEGORIES.find(c => c.id === r.category)?.icon} {r.area}</span>
                 <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', r.id), { status: r.status === 'pending' ? 'solved' : 'pending' })} style={{ border: 'none', padding: '6px 12px', borderRadius: '10px', fontSize: '10px', fontWeight: '900', background: r.status === 'solved' ? '#fbbf24' : '#fffbeb', color: r.status === 'solved' ? 'white' : '#b45309', cursor: 'pointer' }}>{r.status === 'solved' ? '해결됨 ✓' : '진행중'}</button>
               </div>
               {r.image && <img src={r.image} style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '18px', marginBottom: '12px' }} />}
               <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#451a03', lineHeight: '1.5' }}>{r.description || "내용 없음"}</p>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #fffbeb' }}>
                 <span style={{ fontSize: '11px', color: '#92400e', fontWeight: '800' }}>👤 {r.userName}</span>
                 {(r.userName === nickname || isAdmin) && <button onClick={() => handleDelete(r.id)} style={{ border: 'none', background: 'none', color: '#fca5a5', cursor: 'pointer' }}><Trash2 size={16}/></button>}
               </div>
             </div>
           ))}
        </div>

        {/* Tab 4: 통계 */}
        <div style={{ position: 'absolute', inset: 0, backgroundColor: '#fefce8', visibility: activeTab === 'stats' ? 'visible' : 'hidden', opacity: activeTab === 'stats' ? 1 : 0, transition: 'opacity 0.3s', padding: '24px', overflowY: 'auto' }}>
           <h2 style={{ fontWeight: '900', color: '#78350f', marginBottom: '24px' }}>ACTIVITY STATS</h2>
           <div style={{ backgroundColor: '#78350f', padding: '30px', borderRadius: '32px', color: 'white', textAlign: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '3rem', fontWeight: '900', margin: '0' }}>{solvedCount}</h3>
              <p style={{ fontSize: '0.8rem', fontWeight: '900', color: '#fbbf24', opacity: 0.8, letterSpacing: '2px' }}>CLEANED UP!</p>
           </div>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '30px' }}>
              <div style={{ background: 'white', padding: '20px', borderRadius: '24px', textAlign: 'center' }}><p style={{ margin: 0, fontSize: '10px', color: '#92400e', fontWeight: '900' }}>TOTAL</p><p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: '900' }}>{reports.length}</p></div>
              <div style={{ background: 'white', padding: '20px', borderRadius: '24px', textAlign: 'center' }}><p style={{ margin: 0, fontSize: '10px', color: '#92400e', fontWeight: '900' }}>RATE</p><p style={{ margin: '5px 0 0 0', fontSize: '20px', fontWeight: '900', color: '#fbbf24' }}>{reports.length > 0 ? Math.round((solvedCount/reports.length)*100) : 0}%</p></div>
           </div>

           {isAdmin && (
              <div style={{ background: 'white', padding: '24px', borderRadius: '32px', border: '2px dashed #fca5a5', textAlign: 'center' }}>
                 <h4 style={{ color: '#ef4444', fontWeight: '900', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><AlertTriangle size={18}/> ADMIN TOOLS</h4>
                 <p style={{ fontSize: '0.75rem', color: '#92400e', opacity: 0.6, marginBottom: '20px' }}>관리자 권한으로 모든 데이터를 삭제할 수 있습니다.</p>
                 <button onClick={clearAllData} style={{ width: '100%', background: '#ef4444', color: 'white', border: 'none', padding: '14px', borderRadius: '15px', fontWeight: '900', cursor: 'pointer' }}>데이터 초기화</button>
              </div>
           )}
        </div>
      </main>

      <nav style={{ height: '75px', backgroundColor: 'white', borderTop: '1px solid #fde68a', display: 'flex', justifyContent: 'space-around', alignItems: 'center', paddingBottom: '10px' }}>
        <button onClick={() => setActiveTab('map')} style={{ border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <MapPin size={24} color={activeTab === 'map' ? '#fbbf24' : '#d97706'} fill={activeTab === 'map' ? '#fbbf24' : 'none'}/>
          <span style={{ fontSize: '10px', fontWeight: '900', color: activeTab === 'map' ? '#fbbf24' : '#d97706' }}>지도</span>
        </button>
        <button onClick={() => setActiveTab('list')} style={{ border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <List size={24} color={activeTab === 'list' ? '#fbbf24' : '#d97706'}/>
          <span style={{ fontSize: '10px', fontWeight: '900', color: activeTab === 'list' ? '#fbbf24' : '#d97706' }}>피드</span>
        </button>
        <button onClick={() => setActiveTab('stats')} style={{ border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <BarChart3 size={24} color={activeTab === 'stats' ? '#fbbf24' : '#d97706'}/>
          <span style={{ fontSize: '10px', fontWeight: '900', color: activeTab === 'stats' ? '#fbbf24' : '#d97706' }}>통계</span>
        </button>
      </nav>
      <style>{`
        .custom-pin { background: none !important; border: none !important; }
        ::-webkit-scrollbar { width: 0px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);