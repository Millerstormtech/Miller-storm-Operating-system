import { useRef, useState, useEffect } from "react";

type AppToolCategory = {
  _id: string;
  name: string;
  slug: string;
  order: number;
  status: 'draft' | 'published';
};

type AppToolItem = {
  _id: string;
  title: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  description: string;
  link: string;
  webLink?: string;
  appStoreLink?: string;
  playStoreLink?: string;
  category: string;
  status: 'draft' | 'published';
};

export function AppsToolManagement() {
  const [categories, setCategories] = useState<AppToolCategory[]>([]);
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, AppToolItem[]>>({});
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [isCreating, setIsCreating] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<AppToolItem | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newLink, setNewLink] = useState("");
  const [newWebLink, setNewWebLink] = useState("");
  const [newAppStoreLink, setNewAppStoreLink] = useState("");
  const [newPlayStoreLink, setNewPlayStoreLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewWidth, setPreviewWidth] = useState(400);
  const [previewHeight, setPreviewHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    fetchCategories();
    fetchAppTools();
  }, []);

  // Handle resize mouse events
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      
      const newWidth = Math.max(200, Math.min(800, resizeStart.width + deltaX));
      const newHeight = Math.max(150, Math.min(600, resizeStart.height + deltaY));
      
      setPreviewWidth(newWidth);
      setPreviewHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'nwse-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizeStart]);

  async function fetchCategories() {
    try {
      const response = await fetch('/api/apps-tools/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data.sort((a: AppToolCategory, b: AppToolCategory) => a.order - b.order));
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }

  async function fetchAppTools() {
    try {
      const response = await fetch('/api/apps-tools');
      if (response.ok) {
        const data = await response.json();
        const grouped: Record<string, AppToolItem[]> = {};
        data.forEach((item: AppToolItem) => {
          if (!grouped[item.category]) {
            grouped[item.category] = [];
          }
          grouped[item.category].push(item);
        });
        setItemsByCategory(grouped);
      }
    } catch (error) {
      console.error('Error fetching apps/tools:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createCategory() {
    if (!newCategoryName.trim()) return;
    
    try {
      const response = await fetch('/api/apps-tools/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName,
          order: categories.length
        })
      });

      if (response.ok) {
        const newCategory = await response.json();
        setCategories([...categories, newCategory]);
        setIsCreatingCategory(false);
        setNewCategoryName("");
      }
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Failed to create category');
    }
  }

  async function updateCategory(id: string) {
    if (!editingCategoryName.trim()) return;
    
    const oldCategory = categories.find(cat => cat._id === id);
    const oldSlug = oldCategory?.slug;
    
    try {
      const response = await fetch(`/api/apps-tools/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingCategoryName
        })
      });

      if (response.ok) {
        const updatedCategory = await response.json();
        setCategories(categories.map(cat => cat._id === id ? updatedCategory : cat));
        
        // Update items grouping if slug changed
        if (oldSlug && oldSlug !== updatedCategory.slug) {
          const itemsInOldCategory = itemsByCategory[oldSlug] || [];
          const updatedItems = itemsInOldCategory.map(item => ({
            ...item,
            category: updatedCategory.slug
          }));
          
          const newItemsByCategory = { ...itemsByCategory };
          delete newItemsByCategory[oldSlug];
          newItemsByCategory[updatedCategory.slug] = updatedItems;
          setItemsByCategory(newItemsByCategory);
        }
        
        setIsEditingCategory(null);
        setEditingCategoryName("");
      }
    } catch (error) {
      console.error('Error updating category:', error);
      alert('Failed to update category');
    }
  }

  async function updateCategoryStatus(id: string, status: 'draft' | 'published') {
    try {
      const response = await fetch(`/api/apps-tools/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: categories.find(cat => cat._id === id)?.name,
          status 
        })
      });

      if (response.ok) {
        const updatedCategory = await response.json();
        setCategories(categories.map(cat => cat._id === id ? updatedCategory : cat));
      }
    } catch (error) {
      console.error('Error updating category status:', error);
      alert('Failed to update category status');
    }
  }

  async function updateItemStatus(categorySlug: string, id: string, status: 'draft' | 'published') {
    try {
      const response = await fetch(`/api/apps-tools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        const updatedItem = await response.json();
        setItemsByCategory(prev => ({
          ...prev,
          [categorySlug]: (prev[categorySlug] || []).map(item => item._id === id ? updatedItem : item)
        }));
      }
    } catch (error) {
      console.error('Error updating item status:', error);
      alert('Failed to update item status');
    }
  }

  async function deleteCategory(id: string, slug: string) {
    const itemsInCategory = itemsByCategory[slug] || [];
    if (itemsInCategory.length > 0) {
      alert(`Cannot delete category with ${itemsInCategory.length} items. Please delete or move the items first.`);
      return;
    }

    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      const response = await fetch(`/api/apps-tools/categories/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setCategories(categories.filter(cat => cat._id !== id));
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category');
    }
  }

  async function handleFileUpload(file: File, isEdit: boolean = false) {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (isEdit) {
          setEditingItem(prev => prev ? {...prev, imageUrl: data.url} : null);
        } else {
          setNewImageUrl(data.url);
        }
      } else {
        alert('Failed to upload image');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  }

  async function createItem(categorySlug: string) {
    if (!newTitle.trim()) return;
    
    try {
      const response = await fetch('/api/apps-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          imageUrl: newImageUrl,
          imageWidth: previewWidth,
          imageHeight: previewHeight,
          description: newDescription,
          link: newLink,
          webLink: newWebLink,
          appStoreLink: newAppStoreLink,
          playStoreLink: newPlayStoreLink,
          category: categorySlug
        })
      });

      if (response.ok) {
        const newItem = await response.json();
        setItemsByCategory(prev => ({
          ...prev,
          [categorySlug]: [...(prev[categorySlug] || []), newItem]
        }));
        setIsCreating(null);
        setNewTitle("");
        setNewImageUrl("");
        setNewDescription("");
        setNewLink("");
        setNewWebLink("");
        setNewAppStoreLink("");
        setNewPlayStoreLink("");
        setPreviewWidth(400);
        setPreviewHeight(300);
      }
    } catch (error) {
      console.error('Error creating app/tool:', error);
      alert('Failed to create app/tool');
    }
  }

  async function updateItem(categorySlug: string, id: string) {
    if (!editingItem || !editingItem.title.trim()) return;
    
    try {
      const response = await fetch(`/api/apps-tools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingItem.title,
          imageUrl: editingItem.imageUrl,
          imageWidth: previewWidth,
          imageHeight: previewHeight,
          description: editingItem.description,
          link: editingItem.link,
          webLink: editingItem.webLink,
          appStoreLink: editingItem.appStoreLink,
          playStoreLink: editingItem.playStoreLink,
          category: editingItem.category
        })
      });

      if (response.ok) {
        const updatedItem = await response.json();
        setItemsByCategory(prev => ({
          ...prev,
          [categorySlug]: (prev[categorySlug] || []).map(item => item._id === id ? updatedItem : item)
        }));
        setIsEditing(null);
        setEditingItem(null);
        setPreviewWidth(400);
        setPreviewHeight(300);
      }
    } catch (error) {
      console.error('Error updating app/tool:', error);
      alert('Failed to update app/tool');
    }
  }

  function startEdit(item: AppToolItem) {
    setIsEditing(item._id);
    setEditingItem({ ...item });
    setPreviewWidth(item.imageWidth || 400);
    setPreviewHeight(item.imageHeight || 300);
  }

  function cancelEdit() {
    setIsEditing(null);
    setEditingItem(null);
  }

  async function deleteItem(categorySlug: string, id: string) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const response = await fetch(`/api/apps-tools/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setItemsByCategory(prev => ({
          ...prev,
          [categorySlug]: (prev[categorySlug] || []).filter(item => item._id !== id)
        }));
      }
    } catch (error) {
      console.error('Error deleting app/tool:', error);
      alert('Failed to delete app/tool');
    }
  }

  function renderSection(category: AppToolCategory) {
    const items = itemsByCategory[category.slug] || [];
    
    return (
      <div key={category._id} className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {isEditingCategory === category._id ? (
                <>
                  <input 
                    className="field-input" 
                    value={editingCategoryName} 
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    style={{ width: 200 }}
                    placeholder="Category name"
                  />
                  <button type="button" className="btn-primary btn-small" onClick={() => updateCategory(category._id)}>
                    Save
                  </button>
                  <button type="button" className="btn-secondary btn-small" onClick={() => {
                    setIsEditingCategory(null);
                    setEditingCategoryName("");
                  }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span>{category.name}</span>
                  <button type="button" className="btn-ghost btn-small" onClick={() => {
                    setIsEditingCategory(category._id);
                    setEditingCategoryName(category.name);
                  }}>
                    ✏️ Edit
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
                    <button
                      type="button"
                      onClick={() => updateCategoryStatus(category._id, category.status === 'published' ? 'draft' : 'published')}
                      style={{
                        position: 'relative',
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        backgroundColor: category.status === 'published' ? '#16a34a' : '#d1d5db',
                        padding: 0
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: 2,
                        left: category.status === 'published' ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        backgroundColor: 'white',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                      }} />
                    </button>
                    <span style={{ color: category.status === 'published' ? '#16a34a' : '#6b7280', fontWeight: 600, fontSize: 12 }}>
                      {category.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <button type="button" className="btn-ghost btn-danger btn-small" onClick={() => deleteCategory(category._id, category.slug)}>
                    🗑️ Delete
                  </button>
                </>
              )}
            </div>
            <button type="button" className="btn-primary btn-success btn-small" onClick={() => setIsCreating(category.slug)}>
              + Create {category.name.endsWith('s') ? category.name.slice(0, -1) : category.name}
            </button>
          </div>
        </div>
        <div className="panel-body">
          {isCreating === category.slug && (
            <div style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 16, paddingBottom: 16 }}>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Title</span>
                  <input className="field-input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Enter title" />
                </label>
                <label className="field">
                  <span className="field-label">Image</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="field-input" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="Image" style={{ flex: 1 }} />
                    <button type="button" className="btn-secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }} />
                  </div>
                  {newImageUrl && (
                    <div style={{ marginTop: 12, position: 'relative', display: 'inline-block' }}>
                      <div style={{ 
                        width: previewWidth, 
                        height: previewHeight,
                        border: '2px solid #e5e7eb',
                        borderRadius: 8,
                        overflow: 'hidden',
                        position: 'relative',
                        backgroundImage: `url(${newImageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}>
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: 20,
                          height: 20,
                          background: '#3b82f6',
                          cursor: 'nwse-resize',
                          borderTopLeftRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: 12,
                          fontWeight: 'bold'
                        }}
                        onMouseDown={(e) => {
                          setIsResizing(true);
                          setResizeStart({
                            x: e.clientX,
                            y: e.clientY,
                            width: previewWidth,
                            height: previewHeight
                          });
                        }}
                        >
                          ⇲
                        </div>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                        {previewWidth} × {previewHeight} px (drag corner to resize)
                      </div>
                    </div>
                  )}
                </label>
              </div>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">Description</span>
                <textarea className="field-input" rows={3} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Enter description" />
              </label>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">Web Link</span>
                <input className="field-input" value={newWebLink} onChange={(e) => setNewWebLink(e.target.value)} placeholder="https://" />
              </label>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">App Store Link (iOS)</span>
                <input className="field-input" value={newAppStoreLink} onChange={(e) => setNewAppStoreLink(e.target.value)} placeholder="https://apps.apple.com/..." />
              </label>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">Play Store Link (Android)</span>
                <input className="field-input" value={newPlayStoreLink} onChange={(e) => setNewPlayStoreLink(e.target.value)} placeholder="https://play.google.com/..." />
              </label>
              <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                <button type="button" className="btn-primary btn-success" onClick={() => createItem(category.slug)}>Create</button>
                <button type="button" className="btn-secondary" style={{ color: "#dc2626" }} onClick={() => {
                  setIsCreating(null);
                  setNewTitle("");
                  setNewImageUrl("");
                  setNewDescription("");
                  setNewLink("");
                  setNewWebLink("");
                  setNewAppStoreLink("");
                  setNewPlayStoreLink("");
                }}>Cancel</button>
              </div>
            </div>
          )}
          {isEditing && items.some(item => item._id === isEditing) && (
            <div style={{ borderBottom: "1px solid #e5e7eb", marginBottom: 16, paddingBottom: 16 }}>
              <h4 style={{ marginBottom: 16, color: "#374151" }}>Edit {category.name.endsWith('s') ? category.name.slice(0, -1) : category.name}</h4>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Title</span>
                  <input className="field-input" value={editingItem?.title || ''} onChange={(e) => setEditingItem(prev => prev ? {...prev, title: e.target.value} : null)} placeholder="Enter title" />
                </label>
                <label className="field">
                  <span className="field-label">Image</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="field-input" value={editingItem?.imageUrl || ''} onChange={(e) => setEditingItem(prev => prev ? {...prev, imageUrl: e.target.value} : null)} placeholder="Image" style={{ flex: 1 }} />
                    <button type="button" className="btn-secondary" disabled={uploading} onClick={() => editFileInputRef.current?.click()}>
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                    <input ref={editFileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, true);
                    }} />
                  </div>
                  {editingItem?.imageUrl && (
                    <div style={{ marginTop: 12, position: 'relative', display: 'inline-block' }}>
                      <div style={{ 
                        width: previewWidth, 
                        height: previewHeight,
                        border: '2px solid #e5e7eb',
                        borderRadius: 8,
                        overflow: 'hidden',
                        position: 'relative',
                        backgroundImage: `url(${editingItem.imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}>
                        <div style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: 20,
                          height: 20,
                          background: '#3b82f6',
                          cursor: 'nwse-resize',
                          borderTopLeftRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: 12,
                          fontWeight: 'bold'
                        }}
                        onMouseDown={(e) => {
                          setIsResizing(true);
                          setResizeStart({
                            x: e.clientX,
                            y: e.clientY,
                            width: previewWidth,
                            height: previewHeight
                          });
                        }}
                        >
                          ⇲
                        </div>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                        {previewWidth} × {previewHeight} px (drag corner to resize)
                      </div>
                    </div>
                  )}
                </label>
              </div>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">Description</span>
                <textarea className="field-input" rows={3} value={editingItem?.description || ''} onChange={(e) => setEditingItem(prev => prev ? {...prev, description: e.target.value} : null)} placeholder="Enter description" />
              </label>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">Web Link</span>
                <input className="field-input" value={editingItem?.webLink || ''} onChange={(e) => setEditingItem(prev => prev ? {...prev, webLink: e.target.value} : null)} placeholder="https://" />
              </label>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">App Store Link (iOS)</span>
                <input className="field-input" value={editingItem?.appStoreLink || ''} onChange={(e) => setEditingItem(prev => prev ? {...prev, appStoreLink: e.target.value} : null)} placeholder="https://apps.apple.com/..." />
              </label>
              <label className="field" style={{ marginTop: 16 }}>
                <span className="field-label">Play Store Link (Android)</span>
                <input className="field-input" value={editingItem?.playStoreLink || ''} onChange={(e) => setEditingItem(prev => prev ? {...prev, playStoreLink: e.target.value} : null)} placeholder="https://play.google.com/..." />
              </label>
              <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                <button type="button" className="btn-primary btn-success" onClick={() => {
                  const editingItemInThisSection = items.find(item => item._id === isEditing);
                  if (editingItemInThisSection) updateItem(category.slug, editingItemInThisSection._id);
                }}>Save</button>
                <button type="button" className="btn-secondary" onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          )}
          {items.length === 0 ? (
            <div className="panel-empty">No {category.name.toLowerCase()} yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: 20 }}>
              {items.map((item) => (
                <div key={item._id} className="card" style={{ padding: 0, overflow: "hidden", height: "100%", position: 'relative' }}>
                  <div style={{ 
                    width: "100%", 
                    height: item.imageHeight || 280, 
                    backgroundImage: item.imageUrl && !item.imageUrl.startsWith('blob:') ? `url(${item.imageUrl})` : 'none',
                    backgroundColor: '#f3f4f6',
                    backgroundSize: "cover", 
                    backgroundPosition: "center",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    fontSize: 14
                  }}>
                    {(!item.imageUrl || item.imageUrl.startsWith('blob:')) && 'No Image'}
                  </div>
                  <div style={{ padding: 20 }}>
                    <div className="card-title" style={{ marginBottom: 8 }}>{item.title}</div>
                    <div className="card-description" style={{ marginBottom: 12, fontSize: 13 }}>
                      {item.description.length > 50 ? `${item.description.substring(0, 50)}...` : item.description}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                      {item.webLink && (
                        <a href={item.webLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", padding: "4px 8px", border: "1px solid #2563eb", borderRadius: "4px", display: "inline-block", width: "fit-content" }}>
                          Web Link
                        </a>
                      )}
                      {item.appStoreLink && (
                        <a href={item.appStoreLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", padding: "4px 8px", border: "1px solid #2563eb", borderRadius: "4px", display: "inline-block", width: "fit-content" }}>
                          App Store (iOS)
                        </a>
                      )}
                      {item.playStoreLink && (
                        <a href={item.playStoreLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", padding: "4px 8px", border: "1px solid #2563eb", borderRadius: "4px", display: "inline-block", width: "fit-content" }}>
                          Play Store (Android)
                        </a>
                      )}
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn-secondary btn-small" onClick={() => startEdit(item)}>Edit</button>
                        <button type="button" className="btn-ghost btn-danger btn-small" onClick={() => deleteItem(category.slug, item._id)}>Delete</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => updateItemStatus(category.slug, item._id, item.status === 'published' ? 'draft' : 'published')}
                          style={{
                            position: 'relative',
                            width: 36,
                            height: 20,
                            borderRadius: 10,
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                            backgroundColor: item.status === 'published' ? '#16a34a' : '#d1d5db',
                            padding: 0
                          }}
                        >
                          <div style={{
                            position: 'absolute',
                            top: 2,
                            left: item.status === 'published' ? 18 : 2,
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            backgroundColor: 'white',
                            transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                          }} />
                        </button>
                        <span style={{ color: item.status === 'published' ? '#16a34a' : '#6b7280', fontWeight: 600, fontSize: 11 }}>
                          {item.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div>
      {/* Category Management Section */}
      <div className="panel" style={{ marginBottom: 24, background: '#f9fafb' }}>
        <div className="panel-header">
          <div className="panel-header-row">
            <span style={{ fontWeight: 600, fontSize: 16 }}>📁 Category Management</span>
            <button type="button" className="btn-primary btn-success" onClick={() => setIsCreatingCategory(true)}>
              + Create Category
            </button>
          </div>
        </div>
        {isCreatingCategory && (
          <div className="panel-body">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input 
                className="field-input" 
                value={newCategoryName} 
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter category name (e.g., Apps, Tools, Resources)"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn-primary btn-success" onClick={createCategory}>
                Create
              </button>
              <button type="button" className="btn-secondary" onClick={() => {
                setIsCreatingCategory(false);
                setNewCategoryName("");
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Render all category sections */}
      {categories.length === 0 ? (
        <div className="panel">
          <div className="panel-body">
            <div className="panel-empty">
              No categories yet. Create your first category to get started!
            </div>
          </div>
        </div>
      ) : (
        categories.map(category => renderSection(category))
      )}
    </div>
  );
}
