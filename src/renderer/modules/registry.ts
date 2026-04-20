import { AnalysisModule } from '@/types/module'

const moduleRegistry: Map<string, AnalysisModule> = new Map()

export function registerModule(module: AnalysisModule): void {
  moduleRegistry.set(module.id, module)
}

export function getModules(): AnalysisModule[] {
  return Array.from(moduleRegistry.values()).sort((a, b) => a.order - b.order)
}

export function getModule(id: string): AnalysisModule | undefined {
  return moduleRegistry.get(id)
}
