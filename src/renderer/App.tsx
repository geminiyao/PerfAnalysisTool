import React from 'react'
import TitleBar from './components/TitleBar'
import SidePanel from './components/SidePanel'
import StatusBar from './components/StatusBar'
import AnalysisTabs from './modules/AnalysisTabs'
import styles from './App.module.less'

const App: React.FC = () => {
  return (
    <div className={styles.appContainer}>
      <TitleBar />
      <div className={styles.bodyContainer}>
        <SidePanel />
        <div className={styles.mainContent}>
          <AnalysisTabs />
        </div>
      </div>
      <StatusBar />
    </div>
  )
}

export default App
