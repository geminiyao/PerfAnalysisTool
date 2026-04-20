import React from 'react'

export interface AnalysisModule {
  id: string
  name: string
  icon?: React.ReactNode
  order: number
  component: React.ComponentType
  timelineConfig?: {
    label: string
    color: string
    unit: string
  }
}
