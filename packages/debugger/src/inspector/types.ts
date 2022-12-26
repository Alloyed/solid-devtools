import type { NodeID, ValueItemID } from '../main/types'
import type { StoreNodeProperty } from './store'

export type { SetInspectedNodeData, ToggleInspectedValueData } from '.'

export const INFINITY = 'Infinity'
export const NEGATIVE_INFINITY = 'NegativeInfinity'
export const NAN = 'NaN'
export const UNDEFINED = 'undefined'

export enum ValueType {
  Number = 'number',
  Boolean = 'boolean',
  String = 'string',
  Null = 'null',
  Symbol = 'symbol',
  Array = 'array',
  Object = 'object',
  Function = 'function',
  Getter = 'getter',
  Element = 'element',
  Instance = 'instance',
  Store = 'store',
  Unknown = 'unknown',
}

type EncodedValueDataMap = {
  [ValueType.Null]: null | typeof UNDEFINED
  [ValueType.Array]: number | number[]
  [ValueType.Object]: number | { [key: string]: number }
  [ValueType.Number]: number | typeof INFINITY | typeof NEGATIVE_INFINITY | typeof NAN
  [ValueType.Boolean]: boolean
  [ValueType.String]: string
  [ValueType.Symbol]: string
  [ValueType.Function]: string
  [ValueType.Getter]: string
  [ValueType.Element]: `${NodeID}:${string}`
  [ValueType.Instance]: string
  [ValueType.Store]: `${NodeID}:${number}`
  [ValueType.Unknown]: never
}

export type EncodedValueMap = {
  [T in ValueType]: [type: T, data: EncodedValueDataMap[T]]
}
export type EncodedValue<T extends ValueType = ValueType> = EncodedValueMap[T]

export enum PropGetterState {
  Stale = 'stale',
  Live = 'live',
}

export type InspectorUpdateMap = {
  value: [id: ValueItemID, value: EncodedValue[]]
  store: [store: StoreNodeProperty, value: EncodedValue[] | null | number]
  /** List of new keys — all of the values are getters, so they won't change */
  propKeys: { added: string[]; removed: string[] }
  /** state of getter props (STALE | LIVE) */
  propState: { [key in string]?: PropGetterState }
}

export type InspectorUpdate = {
  [T in keyof InspectorUpdateMap]: [type: T, data: InspectorUpdateMap[T]]
}[keyof InspectorUpdateMap]
