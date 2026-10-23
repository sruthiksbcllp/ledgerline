import React, { useEffect } from 'react';
import { Button, Card, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Coffee, Eye, Edit2, Trash2 } from 'lucide-react';
import { logout } from '../store/authSlice';

const { Title, Text } = Typography;

const Logout = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // The page used to just display a static "logged out" UI without actually
  // dispatching the logout thunk, so the user remained authenticated (token
  // and Redux state intact). Trigger the real logout on mount.
  useEffect(() => {
    dispatch(logout());
  }, [dispatch]);

  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      background: 'var(--color-bg-page)' 
    }}>
      <Card style={{ 
        width: 800, 
        padding: 0, 
        overflow: 'hidden', 
        borderRadius: '16px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex' }}>
          {/* Left Side: Branding */}
          <div style={{ 
            flex: 1, 
            background: 'linear-gradient(165deg, #312E81 0%, #0B1020 70%)', 
            padding: '40px', 
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative'
          }}>
            <h2 style={{ color: 'white', margin: 0, letterSpacing: '-0.04em' }}>LedgerLine</h2>
            <div style={{ marginTop: '40px', textAlign: 'center' }}>
                <Text style={{ color: 'white', fontSize: '18px', fontStyle: 'italic' }}>
                    "Great things are never done by one person. They're done by a team."
                </Text>
            </div>
            <div style={{ marginTop: '20px', display: 'flex', gap: '4px' }}>
                <div style={{ width: 12, height: 4, background: 'var(--color-success)', borderRadius: 2 }}></div>
                <div style={{ width: 12, height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2 }}></div>
                <div style={{ width: 12, height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2 }}></div>
            </div>
          </div>

          {/* Right Side: Logout Message */}
          <div style={{ 
            flex: 1, 
            padding: '60px', 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center',
            background: 'white'
          }}>
            <div style={{ marginBottom: '32px', color: 'var(--color-success)' }}>
                <Coffee size={64} strokeWidth={1} />
            </div>
            <Title level={2} style={{ marginBottom: '8px' }}>You are Logged Out</Title>
            <Text type="secondary" style={{ marginBottom: '32px' }}>Thank you for using LedgerLine.</Text>
            
            <Button 
                type="primary" 
                size="large" 
                block 
                onClick={() => navigate('/login')}
                style={{ 
                    background: 'var(--gradient-orange)',
                    border: 'none', 
                    height: '48px', 
                    borderRadius: '8px',
                    fontWeight: 600
                }}
            >
              Sign In
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Logout;
