import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { SalesLayout } from "../../../src/portals/sales/SalesLayout";
import { useAuth } from "../../../src/contexts/AuthContext";

type AppToolItem = {
  _id: string;
  title: string;
  imageUrl: string;
  description: string;
  link: string;
  webLink?: string;
  appStoreLink?: string;
  playStoreLink?: string;
  category: string; // Dynamic category
};

const AppToolDetailPage: NextPage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const [item, setItem] = useState<AppToolItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchAppTool();
    }
  }, [id]);

  async function fetchAppTool() {
    try {
      const response = await fetch(`/api/apps-tools/${id}`);
      if (response.ok) {
        const data = await response.json();
        setItem(data);
      } else {
        router.push('/sales/apps-tools');
      }
    } catch (error) {
      console.error('Error fetching app/tool:', error);
      router.push('/sales/apps-tools');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SalesLayout currentView="apps-tools" userName={user?.name} userId={user?.id}>
        <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>
      </SalesLayout>
    );
  }

  if (!item) {
    return (
      <SalesLayout currentView="apps-tools" userName={user?.name} userId={user?.id}>
        <div style={{ padding: 24, textAlign: 'center' }}>Item not found</div>
      </SalesLayout>
    );
  }

  return (
    <SalesLayout currentView="apps-tools" userName={user?.name} userId={user?.id}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <button 
          onClick={() => router.back()} 
          className="btn-secondary"
          style={{ padding: '12px 24px', fontSize: '16px' }}
        >
          ← Back
        </button>
      </div>
      
      <div className="panel">
        <div className="panel-body">
          <div style={{ display: 'flex', gap: 32, marginBottom: 32, alignItems: 'center' }}>
            {item.imageUrl && (
              <div style={{ flex: '0 0 400px' }}>
                <img 
                  src={item.imageUrl} 
                  alt={item.title}
                  style={{ 
                    width: '100%', 
                    height: 'auto', 
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                  }}
                />
              </div>
            )}
            
            <div style={{ flex: 1 }}>
              <h2 style={{ marginBottom: 16, color: '#374151', fontSize: '24px' }}>{item.title}</h2>
              
              {item.description && (
                <div>
                  <h3 style={{ marginBottom: 8, fontSize: '16px', color: '#6b7280' }}>Description</h3>
                  <p style={{ lineHeight: 1.6, color: '#374151', fontSize: '16px' }}>
                    {item.description}
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {item.category !== 'apps' && item.link && (
              <a 
                href={item.link} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ 
                  display: 'inline-block', 
                  textDecoration: 'none',
                  padding: '12px 24px'
                }}
              >
                Open Web Link
              </a>
            )}
            
            {item.category === 'apps' && (
              <>
                {item.webLink && (
                  <a 
                    href={item.webLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{ 
                      display: 'inline-block', 
                      textDecoration: 'none',
                      padding: '12px 24px'
                    }}
                  >
                    Open Web Link
                  </a>
                )}
                
                {item.appStoreLink && (
                  <a 
                    href={item.appStoreLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{ 
                      display: 'inline-block', 
                      textDecoration: 'none',
                      padding: '12px 24px',
                      backgroundColor: '#007AFF'
                    }}
                  >
                    Download on App Store (iOS)
                  </a>
                )}
                
                {item.playStoreLink && (
                  <a 
                    href={item.playStoreLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{ 
                      display: 'inline-block', 
                      textDecoration: 'none',
                      padding: '12px 24px',
                      backgroundColor: '#34A853'
                    }}
                  >
                    Download on Play Store (Android)
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </SalesLayout>
  );
};

export default AppToolDetailPage;