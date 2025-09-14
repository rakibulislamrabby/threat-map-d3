'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import styles from './page.module.css';

// Import LiveThreatMap with SSR disabled to prevent hydration errors
const LiveThreatMap = dynamic(() => import('../component/LiveThreatMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#000000'
    }}>
      <div style={{ color: '#ffffff', fontSize: '16px' }}>
        Loading live threat map...
      </div>
    </div>
  )
});

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 style={{ 
          textAlign: 'center', 
          marginBottom: '2rem',
          color: '#ffffff',
          fontSize: '2rem',
          fontWeight: 'bold'
        }}>
          Live Cyber Threat Map
        </h1>
        <LiveThreatMap />
      </main>
    </div>
  );
}