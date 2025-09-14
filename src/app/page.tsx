'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import styles from './page.module.css';

// Import SimpleWorldMap with SSR disabled to prevent hydration errors
const SimpleWorldMap = dynamic(() => import('../component/SimpleWorldMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ffffff'
    }}>
      <div style={{ color: '#333', fontSize: '16px' }}>
        Loading world map...
      </div>
    </div>
  )
});

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {/* <h1 style={{ 
          textAlign: 'center', 
          marginBottom: '2rem',
          color: '#333',
          fontSize: '2rem',
          fontWeight: 'bold'
        }}>
          Live Cyber Threat Map
        </h1> */}
        <SimpleWorldMap />
      </main>
    </div>
  );
}