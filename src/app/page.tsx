import React from 'react';
import WorldMap from '../component/WorldMap';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 style={{ 
          textAlign: 'center', 
          marginBottom: '2rem',
          color: '#333',
          fontSize: '2rem',
          fontWeight: 'bold'
        }}>
          Interactive World Map with D3.js
        </h1>
        <WorldMap />
      </main>
    </div>
  );
}