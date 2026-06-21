import { useState, useEffect } from "react";

type Material = {
  _id: string;
  courseId: string;
  courseName: string;
  pageId: string;
  pageName: string;
  type: 'image' | 'video' | 'url' | 'document';
  url: string;
  title?: string;
  description?: string;
};

type Course = {
  id: string;
  title: string;
  coverImageUrl?: string;
};

type GroupedMaterials = {
  [courseId: string]: {
    courseName: string;
    courseImage?: string;
    pages: {
      [pageId: string]: {
        pageName: string;
        materials: Material[];
      };
    };
  };
};

export function MarketingMaterialsViewer() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      // Fetch both materials and courses
      const [materialsRes, coursesRes] = await Promise.all([
        fetch('/api/marketing-materials'),
        fetch('/api/courses')
      ]);
      
      if (materialsRes.ok) {
        const materialsData = await materialsRes.json();
        setMaterials(materialsData);
      }
      
      if (coursesRes.ok) {
        const coursesData = await coursesRes.json();
        setCourses(coursesData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function syncMaterials() {
    setSyncing(true);
    try {
      const response = await fetch('/api/marketing-materials/sync', {
        method: 'POST'
      });
      
      if (response.ok) {
        await fetchData();
        alert('Materials synced successfully!');
      } else {
        alert('Failed to sync materials');
      }
    } catch (error) {
      console.error('Error syncing materials:', error);
      alert('Failed to sync materials');
    } finally {
      setSyncing(false);
    }
  }

  const groupedMaterials: GroupedMaterials = materials.reduce((acc, material) => {
    if (!acc[material.courseId]) {
      // Find course image
      const course = courses.find(c => c.id === material.courseId);
      acc[material.courseId] = {
        courseName: material.courseName,
        courseImage: course?.coverImageUrl,
        pages: {}
      };
    }
    if (!acc[material.courseId].pages[material.pageId]) {
      acc[material.courseId].pages[material.pageId] = {
        pageName: material.pageName,
        materials: []
      };
    }
    acc[material.courseId].pages[material.pageId].materials.push(material);
    return acc;
  }, {} as GroupedMaterials);

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>;
  }

  // Show course list
  if (!selectedCourseId) {
    const courses = Object.entries(groupedMaterials);
    
    if (courses.length === 0) {
      return (
        <div className="panel">
          <div className="panel-body">
            <div className="panel-empty">No marketing materials available yet.</div>
          </div>
        </div>
      );
    }

    return (
      <div className="panel">
        <div className="panel-header">
          <div className="panel-header-row">
            <span>Courses</span>
            <button 
              type="button" 
              className="btn-primary btn-small" 
              onClick={syncMaterials}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : '🔄 Sync Materials'}
            </button>
          </div>
        </div>
        <div className="panel-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {courses.map(([courseId, course]) => {
              const pageCount = Object.keys(course.pages).length;
              const materialCount = Object.values(course.pages).reduce((sum, page) => sum + page.materials.length, 0);
              
              return (
                <div key={courseId} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setSelectedCourseId(courseId)}>
                  {course.courseImage && (
                    <div style={{ width: "100%", height: 180, backgroundImage: `url(${course.courseImage})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                  )}
                  <div style={{ padding: 16 }}>
                    <div className="card-title">{course.courseName}</div>
                    <div className="card-description" style={{ marginTop: 8, fontSize: 13 }}>
                      {pageCount} page{pageCount !== 1 ? 's' : ''} • {materialCount} material{materialCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Show page list for selected course
  if (selectedCourseId && !selectedPageId) {
    const course = groupedMaterials[selectedCourseId];
    const pages = Object.entries(course.pages);

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <button type="button" className="btn-secondary" onClick={() => setSelectedCourseId(null)}>
            ← Back to Courses
          </button>
        </div>
        <div className="panel">
          <div className="panel-header">
            <span>{course.courseName} - Pages</span>
          </div>
          <div className="panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {pages.map(([pageId, page]) => (
                <div key={pageId} className="card" style={{ cursor: 'pointer' }} onClick={() => setSelectedPageId(pageId)}>
                  <div className="card-title">{page.pageName}</div>
                  <div className="card-description" style={{ marginTop: 8, fontSize: 13 }}>
                    {page.materials.length} material{page.materials.length !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show materials for selected page
  if (selectedCourseId && selectedPageId) {
    const course = groupedMaterials[selectedCourseId];
    const page = course.pages[selectedPageId];

    return (
      <div>
        <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
          <button type="button" className="btn-secondary" onClick={() => setSelectedPageId(null)}>
            ← Back to Pages
          </button>
        </div>
        <div className="panel">
          <div className="panel-header">
            <span>{course.courseName} - {page.pageName}</span>
          </div>
          <div className="panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {page.materials.map((material) => (
                <div key={material._id} className="card">
                  {material.type === 'image' && (
                    <div style={{ width: "100%", height: 180, backgroundImage: `url(${material.url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                  )}
                  {material.type === 'video' && (
                    <div style={{ width: "100%", height: 180, backgroundColor: "#000" }}>
                      <video src={material.url} controls style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                  )}
                  {material.type === 'document' && (
                    <div style={{ width: "100%", height: 180, backgroundColor: "#f3f4f6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <div style={{ fontSize: 48 }}>📄</div>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                        {material.url.split('.').pop()?.toUpperCase()}
                      </div>
                    </div>
                  )}
                  {material.type === 'url' && (
                    <div style={{ width: "100%", height: 180, backgroundColor: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontSize: 48 }}>🔗</div>
                    </div>
                  )}
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, padding: '2px 8px', backgroundColor: '#e5e7eb', borderRadius: 4, fontWeight: 600 }}>
                        {material.type === 'url' ? 'LINK' : material.type === 'document' ? 'DOCUMENT' : material.type.toUpperCase()}
                      </span>
                    </div>
                    {material.title && <div className="card-title" style={{ marginBottom: 8 }}>{material.title}</div>}
                    {material.description && <div className="card-description" style={{ marginBottom: 12, fontSize: 13 }}>{material.description}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {material.type === 'url' ? (
                        <a href={material.url} target="_blank" rel="noopener noreferrer" className="btn-primary btn-small" style={{ display: 'inline-block', textDecoration: 'none' }}>
                          Open Link
                        </a>
                      ) : material.type === 'document' ? (
                        <>
                          <a href={material.url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-small" style={{ display: 'inline-block', textDecoration: 'none' }}>
                            Preview
                          </a>
                          <a href={material.url} download className="btn-primary btn-small" style={{ display: 'inline-block', textDecoration: 'none' }}>
                            📥 Download
                          </a>
                        </>
                      ) : (
                        <>
                          <a href={material.url} target="_blank" rel="noopener noreferrer" className="btn-primary btn-small" style={{ display: 'inline-block', textDecoration: 'none' }}>
                            View
                          </a>
                          <a href={material.url} download className="btn-secondary btn-small" style={{ display: 'inline-block', textDecoration: 'none' }}>
                            📥 Download
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
