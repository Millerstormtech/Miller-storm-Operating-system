import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';

export default function ShareLessonPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { id } = router.query;

  useEffect(() => {
    console.log('ShareLessonPage - isLoading:', isLoading, 'user:', user, 'id:', id);
    
    if (isLoading) return;

    if (!user) {
      // Not logged in, redirect to login with redirect_to parameter
      if (id) {
        console.log('Not logged in, redirecting to login');
        router.push(`/login?redirect_to=/share/lesson/${id}`);
      }
    } else {
      // Logged in, redirect to the lesson in the appropriate panel
      if (id) {
        // Redirect to manager or sales panel based on user role
        if (user.role === 'manager') {
          console.log('Manager user, redirecting to:', `/manager/onlineTraining?lessonId=${id}`);
          router.push(`/manager/onlineTraining?lessonId=${id}`);
        } else if (user.role === 'sales') {
          console.log('Sales user, redirecting to:', `/sales/training?lessonId=${id}`);
          router.push(`/sales/training?lessonId=${id}`);
        } else {
          // For other roles, redirect to home
          console.log('Other role, redirecting to home');
          router.push('/');
        }
      }
    }
  }, [user, isLoading, id, router]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
        <div style={{ color: '#6b7280' }}>Loading...</div>
      </div>
    </div>
  );
}
