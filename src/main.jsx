import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import {
  MapPin,
  List,
  LogOut,
  Flower2,
  Trash2,
  Loader2,
  ChevronRight,
  X,
} from 'lucide-react';

/**
 * [물금동아 데이지 프로젝트 - 통합 실행 파일]
 * 파일 경로 오류를 방지하기 위해 App.jsx 내용을 이 파일에 통합했습니다.
 * 이 코드를 src/main.jsx 에 붙여넣으세요.
 */

// Firebase 설정
const firebaseConfig = {
  apiKey: 'AIzaSyBYfwtdXjz4ekJbH83merNVPZemb_bc3NE',
  authDomain: 'fourseason-run-and-map.firebaseapp.com',
  projectId: 'fourseason-run-and-map',
  storageBucket: 'fourseason-run-and-map.firebasestorage.app',
  messagingSenderId: '671510183044',
  appId: '1:671510183044:web:59ad0cc29cf6bd98f3d6d1',
  databaseURL: 'https://fourseason-run-and-map-default-rtdb.firebaseio.com/',
};

// Firestore 경로 규칙 준수
const appId = 'mulgeum-daisy-v2024-final';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const AREAS = ['물금읍', '증산리', '가촌리', '범어리', '기타 구역'];

// 데이지 꽃 글자 디자인 컴포넌트
const DaisyLetter = ({ letter }) => (
  <div
    style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '38px',
      height: '38px',
      margin: '0 2px',
    }}
  >
    <svg
      viewBox="0 0 100 100"
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))',
      }}
    >
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <ellipse
          key={a}
          cx="50"
          cy="25"
          rx="12"
          ry="25"
          fill="white"
          transform={`rotate(${a} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="18" fill="#fbbf24" />
    </svg>
    <span
      style={{
        position: 'relative',
        zIndex: 1,
        fontWeight: '900',
        fontSize: '14px',
        color: '#451a03',
        marginTop: '1px',
      }}
    >
      {letter}
    </span>
  </div>
);

const App = () => {
  const [user, setUser] = useState(null);
  const [nickname, setNickname] = useState(
    localStorage.getItem('team_nickname') || ''
  );
  const [activeTab, setActiveTab] = useState('map');
  const [reports, setReports] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef({});

  useEffect(() => {
    // 1. 익명 인증 처리 (Rule 3)
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error('Auth Error:', err);
      }
    };
    initAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, setUser);

    // 2. Leaflet 지도 라이브러리 동적 로드
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      setIsScriptLoaded(true);
    };
    document.head.appendChild(script);

    return () => unsubscribeAuth();
  }, []);

  // 3. 실시간 데이터 동기화 (Rule 1 & 3)
  useEffect(() => {
    if (!user) return;

    const reportsCollection = collection(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'reports'
    );
    const unsubscribeData = onSnapshot(
      reportsCollection,
      (snap) => {
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) => new Date(b.discoveredTime) - new Date(a.discoveredTime)
          );
        setReports(data);

        if (window.L && leafletMap.current) {
          Object.values(markersRef.current).forEach((m) => m.remove());
          data.forEach((r) => {
            if (!r.location) return;
            const iconHtml = `
            <div style="background:#fbbf24;width:32px;height:32px;border-radius:10px;border:2px solid white;display:flex;align-items:center;justify-content:center;transform:rotate(45deg);box-shadow:0 2px 8px rgba(0,0,0,0.2);">
              <div style="transform:rotate(-45deg)">🗑️</div>
            </div>`;
            const icon = window.L.divIcon({
              html: iconHtml,
              className: 'custom-marker',
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            });
            markersRef.current[r.id] = window.L.marker(
              [r.location.lat, r.location.lng],
              { icon }
            )
              .addTo(leafletMap.current)
              .bindPopup(`<b>${r.userName}</b><br>${r.description}`);
          });
        }
      },
      (err) => console.error('Firestore Error:', err)
    );

    return () => unsubscribeData();
  }, [user]);

  // 4. 지도 초기화
  useEffect(() => {
    if (
      activeTab === 'map' &&
      mapRef.current &&
      !leafletMap.current &&
      isScriptLoaded
    ) {
      setTimeout(() => {
        if (!mapRef.current) return;
        leafletMap.current = window.L.map(mapRef.current, {
          zoomControl: false,
        }).setView([35.327, 129.007], 14);
        window.L.tileLayer(
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        ).addTo(leafletMap.current);
      }, 300);
    } else if (leafletMap.current) {
      leafletMap.current.invalidateSize();
    }
  }, [activeTab, isScriptLoaded]);

  const handleSave = async () => {
    if (!leafletMap.current || !user) return;
    const desc = prompt('쓰레기 발견 상황을 알려주세요!');
    if (!desc) return;

    setIsUploading(true);
    try {
      const loc = leafletMap.current.getCenter();
      const reportsCollection = collection(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'reports'
      );
      await addDoc(reportsCollection, {
        location: { lat: loc.lat, lng: loc.lng },
        userName: nickname,
        description: desc,
        area: AREAS[0],
        discoveredTime: new Date().toISOString(),
      });
      alert('지도에 성공적으로 기록되었습니다! 🌼');
    } catch (err) {
      alert('기록에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!nickname) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: '#fefce8',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Flower2
            size={64}
            color="#fbbf24"
            style={{ marginBottom: '20px' }}
            className="animate-bounce"
          />
          <h1
            style={{
              fontSize: '2.5rem',
              fontWeight: '900',
              color: '#92400e',
              margin: '0 0 10px 0',
            }}
          >
            물금동아
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DaisyLetter letter="데" />
            <span
              style={{ fontSize: '13px', fontWeight: '800', color: '#92400e' }}
            >
              이터를
            </span>
            <DaisyLetter letter="이" />
            <span
              style={{ fontSize: '13px', fontWeight: '800', color: '#92400e' }}
            >
              용한
            </span>
            <DaisyLetter letter="지" />
            <span
              style={{ fontSize: '13px', fontWeight: '800', color: '#92400e' }}
            >
              역 쓰레기 해결
            </span>
          </div>
        </div>
        <form
          style={{ width: '100%', maxWidth: '340px' }}
          onSubmit={(e) => {
            e.preventDefault();
            const v = e.target.n.value;
            if (v) {
              localStorage.setItem('team_nickname', v);
              setNickname(v);
            }
          }}
        >
          <input
            name="n"
            placeholder="예: 학번_이름"
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '20px',
              border: '2px solid #fde68a',
              textAlign: 'center',
              fontWeight: 'bold',
              fontSize: '1.1rem',
              marginBottom: '20px',
              outline: 'none',
              backgroundColor: 'white',
            }}
            autoFocus
          />
          <button
            style={{
              width: '100%',
              padding: '18px',
              borderRadius: '20px',
              backgroundColor: '#fbbf24',
              color: 'white',
              fontWeight: '900',
              border: 'none',
              fontSize: '1.1rem',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
            }}
          >
            프로젝트 합류하기
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fefce8',
        fontFamily: 'sans-serif',
      }}
    >
      <header
        style={{
          height: '65px',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'white',
          borderBottom: '1px solid #fde68a',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '900',
            color: '#92400e',
          }}
        >
          <Flower2 size={18} color="#fbbf24" /> 물금동아 데이지
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('team_nickname');
            setNickname('');
          }}
          style={{
            border: 'none',
            background: '#fffbeb',
            padding: '8px',
            borderRadius: '10px',
            color: '#b45309',
            cursor: 'pointer',
          }}
        >
          <LogOut size={18} />
        </button>
      </header>

      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {activeTab === 'map' ? (
          <div style={{ width: '100%', height: '100%' }}>
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            <button
              onClick={handleSave}
              disabled={isUploading}
              style={{
                position: 'absolute',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#78350f',
                color: 'white',
                padding: '15px 35px',
                borderRadius: '30px',
                border: 'none',
                fontWeight: '900',
                zIndex: 1001,
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {isUploading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                '기록하기 +'
              )}
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: '24px',
              overflowY: 'auto',
              height: '100%',
              paddingBottom: '100px',
            }}
          >
            <h2
              style={{
                fontWeight: '900',
                color: '#78350f',
                marginBottom: '24px',
              }}
            >
              활동 피드
            </h2>
            {reports.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#d97706',
                  opacity: 0.4,
                }}
              >
                기록이 없습니다.
              </div>
            ) : (
              reports.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: 'white',
                    padding: '20px',
                    borderRadius: '24px',
                    marginBottom: '16px',
                    border: '1px solid #fde68a',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: '900',
                        color: '#78350f',
                        fontSize: '14px',
                      }}
                    >
                      {r.userName}
                    </span>
                    {(r.userName === nickname || nickname === 'admin') && (
                      <button
                        onClick={() => {
                          if (window.confirm('삭제하시겠습니까?'))
                            deleteDoc(
                              doc(
                                db,
                                'artifacts',
                                appId,
                                'public',
                                'data',
                                'reports',
                                r.id
                              )
                            );
                        }}
                        style={{
                          border: 'none',
                          background: 'none',
                          color: '#fca5a5',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <p
                    style={{ margin: '0', color: '#451a03', lineHeight: '1.5' }}
                  >
                    {r.description}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <nav
        style={{
          height: '75px',
          backgroundColor: 'white',
          borderTop: '1px solid #fde68a',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          paddingBottom: '10px',
        }}
      >
        <button
          onClick={() => setActiveTab('map')}
          style={{
            border: 'none',
            background: 'none',
            color: activeTab === 'map' ? '#fbbf24' : '#d97706',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          <MapPin size={24} fill={activeTab === 'map' ? '#fbbf24' : 'none'} />
          <br />
          <span style={{ fontSize: '10px', fontWeight: '900' }}>지도</span>
        </button>
        <button
          onClick={() => setActiveTab('list')}
          style={{
            border: 'none',
            background: 'none',
            color: activeTab === 'list' ? '#fbbf24' : '#d97706',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          <List size={24} />
          <br />
          <span style={{ fontSize: '10px', fontWeight: '900' }}>피드</span>
        </button>
      </nav>

      <style>{`
        .leaflet-container { background: #fefce8 !important; z-index: 1; }
        .custom-marker { background: none !important; border: none !important; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
        ::-webkit-scrollbar { width: 0px; }
      `}</style>
    </div>
  );
};

// 화면 렌더링 코드
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
