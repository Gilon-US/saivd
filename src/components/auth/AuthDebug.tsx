'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/client';

export function AuthDebug() {
  const [authInfo, setAuthInfo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<Record<string, unknown> | null>(null);
  const [uploadApiResult, setUploadApiResult] = useState<Record<string, unknown> | null>(null);
  
  const checkClientAuth = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      
      setAuthInfo({
        hasUser: !!data?.user,
        userId: data?.user?.id,
        email: data?.user?.email,
        error: error?.message
      });
    } catch (error) {
      setAuthInfo({ error: String(error) });
    } finally {
      setLoading(false);
    }
  };
  
  const checkServerAuth = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth-test', {
        credentials: 'include'
      });
      const result = await response.json();
      setApiTestResult(result);
    } catch (error) {
      setApiTestResult({ error: String(error) });
    } finally {
      setLoading(false);
    }
  };
  
  const testUploadApi = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/videos/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: 'test-video.mp4',
          contentType: 'video/mp4',
          filesize: 1024 * 1024, // 1MB
        }),
        credentials: 'include',
      });
      
      const result = await response.json();
      setUploadApiResult(result);
    } catch (error) {
      setUploadApiResult({ error: String(error) });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="p-4 border rounded-md bg-gray-50 dark:bg-gray-800 space-y-4">
      <h3 className="text-lg font-medium">Authentication Debug</h3>
      
      <div className="flex space-x-2 flex-wrap gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={checkClientAuth}
          disabled={loading}
        >
          Check Client Auth
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={checkServerAuth}
          disabled={loading}
        >
          Check Server Auth
        </Button>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={testUploadApi}
          disabled={loading}
        >
          Test Upload API
        </Button>
      </div>
      
      {authInfo && (
        <div className="mt-4">
          <h4 className="font-medium">Client Auth Info:</h4>
          <pre className="p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs overflow-auto">
            {JSON.stringify(authInfo, null, 2)}
          </pre>
        </div>
      )}
      
      {apiTestResult && (
        <div className="mt-4">
          <h4 className="font-medium">Server Auth Info:</h4>
          <pre className="p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs overflow-auto">
            {JSON.stringify(apiTestResult, null, 2)}
          </pre>
        </div>
      )}
      
      {uploadApiResult && (
        <div className="mt-4">
          <h4 className="font-medium">Upload API Test Result:</h4>
          <pre className="p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs overflow-auto">
            {JSON.stringify(uploadApiResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
