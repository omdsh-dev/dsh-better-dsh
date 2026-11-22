import type { AriaAttributes, ButtonHTMLAttributes, MutableRefObject, ReactNode, Ref, ComponentType } from 'react';

export type Translate = (key: string, params?: Record<string, unknown> | null) => string;
export type Cli = 'codex' | 'claude';
export type Tier = 'fast' | 'quality';
export interface BackendSpec { cli: Cli; executable: string; permission: string; permissions: string[]; profile: boolean }
export interface Model { id: string; efforts: string[]; defaultEffort: string }
export interface Backend { enabled: boolean; executable: string; profile?: string; permissionMode: string; defaultModel: string; models: Model[] }
export interface TierValue { provider: string; model: string; reasoningEffort: string }
export interface FormValue { childExitGuard: boolean; delegationPrompt: boolean; trustedHosts: string[]; tiers: Record<Tier, TierValue>; subagents: { eng: boolean; global: boolean } & Record<Cli, Backend> }
export interface SetOperation { op: 'set'; path: string[]; value: unknown }
export interface Validation { key: string; titleKey?: string }
export interface Route { provider: string; model: string; efforts: string[]; defaultEffort: string }
export interface AllowedRoutes { enabled: boolean; routes: Route[] }
export type EndpointState = { status: 'loading' } | { status: 'ready'; value: unknown } | { status: 'error'; message: string };
export type Endpoint = EndpointState & { reload: () => void };
export interface Option { value: string; label: string }
export interface ValueChange { target: { value: string } }
export interface SelectProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange' | 'value'> { children: Option[]; value: string; onChange: (event: ValueChange) => void }
export interface AdvancedProps { summary: ReactNode; children?: ReactNode; detailsRef?: Ref<HTMLDetailsElement>; label?: string }
export interface TabsProps { id: string; label: string; items: { id: string; label: string; active?: boolean }[]; value: string; onChange: (id: string) => void; compact?: boolean; tabRefs?: MutableRefObject<Record<string, HTMLButtonElement | null>> }
export interface FieldProps { id?: string; label: string; hint?: string; showHint?: boolean; wide?: boolean; children?: ReactNode }
export interface SwitchRowProps { id: string; label: string; hint?: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }
export interface HostListProps extends AriaAttributes { hosts: string[]; disabled: boolean; t: Translate; onChange: (hosts: string[]) => void }
export interface ModelRowProps { model: Model; index: number; disabled: boolean; requiredDefault: boolean; t: Translate; onPatch: (patch: Partial<Model>) => void; onRemove: () => void }
export interface TierRowProps { tier: Tier; value: TierValue; allowed: AllowedRoutes | null; disabled: boolean; t: Translate; onPatch: (patch: Partial<TierValue>) => void }
export interface DiscoveryStatus { status: 'loading' | 'ok' | 'error'; text?: string }
export type Discovery = Partial<Record<Cli, DiscoveryStatus>>;
export interface BackendCardProps { spec: BackendSpec; backend: Backend; disabled: boolean; capabilities: Endpoint; discovery: Discovery; discoveryMatches: boolean; scopeActive: boolean; t: Translate; onPatch: (patch: Partial<Backend>) => void; onModelPatch: (index: number, patch: Partial<Model>) => void; onModelAdd: () => void; onModelRemove: (index: number) => void; onDiscover: () => void; onDiagnostics: () => void; generation: number }
export interface FormState { status: string; revision?: number; value?: unknown; writable?: boolean; mode?: string }
export interface ConfigForm { state?: FormState; mutate: (ops: SetOperation[], revision?: number) => Promise<boolean> }
export interface PageProps { form?: ConfigForm; t: Translate }
export interface PanelProps { view?: string; form?: ConfigForm; t?: Translate }
export interface Draft { revision?: number; value: FormValue }
export interface Notice { tone: 'ok' | 'warn' | 'error'; text: string }
export interface DiscoveryRequest { revision?: number; generation: number; executable: string; profile?: string }
export interface Latest { revision?: number; generation: number; backends?: FormValue['subagents'] }
export type Dispose = () => void;
export interface ClientContext { locale: { register: (namespace: string, dictionaries: Record<string, Record<string, string>>) => Dispose; bind: (namespace: string) => Translate }; effect: (callback: () => Dispose, label: string) => unknown; slots: { inject: (name: string, callback: () => Dispose) => Dispose; register: (options: { name: string; key: string; locale: string }, component: ComponentType<PanelProps>) => unknown } }
