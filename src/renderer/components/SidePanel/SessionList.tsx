import React from 'react'
import { Upload, Link, Eye, Copy, Trash2 } from 'lucide-react'
import { useSessionStore } from '@/store/sessionStore'
import styles from './index.module.less'

const SessionList: React.FC = () => {
  const { sessions, activeSessionId, setActiveSession } = useSessionStore()

  return (
    <div>
      <div className={styles.sessionHeader}>
        <div className={styles.sessionTitle}>
          测试列表 <span className={styles.tagBadge}>memgraph</span>
        </div>
        <div className={styles.sessionActions}>
          <button className={styles.sessionActionBtn} title="导入">
            <Upload size={13} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`${styles.sessionCard} ${
              activeSessionId === session.id ? styles.sessionCardActive : ''
            }`}
            onClick={() => setActiveSession(session.id)}
          >
            <div className={styles.sessionCardName}>{session.name}</div>
            <div className={styles.sessionCardMeta}>
              <span>{session.dataSize}</span>
              <span>|</span>
              <span>{session.duration}</span>
            </div>
            <div className={styles.sessionCardTime}>{session.timestamp}</div>
            <div className={styles.sessionCardActions}>
              <button className={styles.smallBtn} title="链接"><Link size={11} /></button>
              <button className={styles.smallBtn} title="查看"><Eye size={11} /></button>
              <button className={styles.smallBtn} title="复制"><Copy size={11} /></button>
              <button className={styles.smallBtn} title="删除"><Trash2 size={11} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SessionList
