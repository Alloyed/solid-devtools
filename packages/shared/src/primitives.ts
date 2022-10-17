import type {
  AccessorArray,
  EffectFunction,
  MemoOptions,
  NoInfer,
  OnEffectFunction,
  SignalOptions,
} from 'solid-js/types/reactive/signal'
import { Accessor, createMemo, createSignal, getOwner, onCleanup, untrack } from 'solid-js'
import { AnyFunction, onRootCleanup } from '@solid-primitives/utils'
import { makeEventListener } from '@solid-primitives/event-listener'
import { createSharedRoot } from '@solid-primitives/rootless'
import { debounce } from '@solid-primitives/scheduled'

export const untrackedCallback = <Fn extends AnyFunction>(fn: Fn): Fn =>
  ((...a: Parameters<Fn>) => untrack<ReturnType<Fn>>(fn.bind(void 0, ...a))) as any

const getRemSize = () => parseFloat(getComputedStyle(document.documentElement).fontSize)

function createRemSize(debounceTimout = 100): Accessor<number> {
  const [remSize, setRemSize] = createSignal(getRemSize())
  const update = debounce(() => setRemSize(getRemSize()), debounceTimout)
  makeEventListener(window, 'resize', update, { passive: true })
  return remSize
}

export const useRemSize = /*#__PURE__*/ createSharedRoot(() => createRemSize())

export function createHover(handle: (hovering: boolean) => void): {
  onMouseEnter: VoidFunction
  onMouseLeave: VoidFunction
} {
  let state = false
  let mounted = true
  onCleanup(() => {
    mounted = false
    if (state) handle((state = false))
  })
  return {
    onMouseEnter: () => state || handle((state = true)),
    onMouseLeave: () => setTimeout(() => mounted && state && handle((state = false))),
  }
}

/**
 * Reactive array reducer — if at least one consumer (boolean signal) is enabled — the returned result will the `true`.
 *
 * For **IOC**
 */
export function createConsumers(): [
  needed: Accessor<boolean>,
  addConsumer: (consumer: Accessor<boolean>) => void,
] {
  const [consumers, setConsumers] = createSignal<Accessor<boolean>[]>([], { name: 'consumers' })
  const enabled = createMemo<boolean>(() => consumers().some(consumer => consumer()))
  return [
    enabled,
    consumer => {
      setConsumers(p => [...p, consumer])
      onRootCleanup(() => setConsumers(p => p.filter(p => p !== consumer)))
    },
  ]
}

// TODO: contribute to @solid-primitives/memo

export type DerivedSignal<T> = [
  value: Accessor<T>,
  setSource: (source?: Accessor<T>) => Accessor<T> | undefined,
]

// types from https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts#L374
/**
 * For **IOC**
 */
export function createDerivedSignal<T>(): DerivedSignal<T>
export function createDerivedSignal<T>(fallback: T, options?: MemoOptions<T>): DerivedSignal<T>
export function createDerivedSignal<T>(fallback?: T, options?: MemoOptions<T>): DerivedSignal<T> {
  const [source, setSource] = createSignal<Accessor<T>>()
  return [
    createMemo(
      () => {
        const sourceRef = source()
        return sourceRef ? sourceRef() : (fallback as T)
      },
      undefined,
      options,
    ),
    newSource => {
      if (newSource && getOwner())
        onCleanup(() => setSource(p => (p === newSource ? undefined : p)))
      return setSource(() => newSource)
    },
  ]
}

// TODO: contribute to solid-primitives

// TODO: better support touch

export function makeHoverElementListener(onHover: (el: HTMLElement | null) => void): void {
  let last: HTMLElement | null = null
  const handleHover = (e: { target: unknown }) => {
    const { target } = e
    if (target === last || (!(target instanceof HTMLElement) && target !== null)) return
    onHover((last = target))
  }
  makeEventListener(window, 'mouseover', handleHover)
  makeEventListener(document, 'mouseleave', handleHover.bind(void 0, { target: null }))
}

/**
 * Solid's `on` helper, but always defers and returns a provided initial value when if does instead of `undefined`.
 *
 * @param deps
 * @param fn
 * @param initialValue
 */
export function defer<S, Next extends Prev, Prev = Next>(
  deps: AccessorArray<S> | Accessor<S>,
  fn: OnEffectFunction<S, undefined | NoInfer<Prev>, Next>,
  initialValue: Next,
): EffectFunction<undefined | NoInfer<Next>, NoInfer<Next>>
export function defer<S, Next extends Prev, Prev = Next>(
  deps: AccessorArray<S> | Accessor<S>,
  fn: OnEffectFunction<S, undefined | NoInfer<Prev>, Next>,
  initialValue?: undefined,
): EffectFunction<undefined | NoInfer<Next>>
export function defer<S, Next extends Prev, Prev = Next>(
  deps: AccessorArray<S> | Accessor<S>,
  fn: OnEffectFunction<S, undefined | NoInfer<Prev>, Next>,
  initialValue?: Next,
): EffectFunction<undefined | NoInfer<Next>> {
  const isArray = Array.isArray(deps)
  let prevInput: S
  let defer = true
  return prevValue => {
    let input: S
    if (isArray) {
      input = Array(deps.length) as S
      for (let i = 0; i < deps.length; i++) (input as any[])[i] = deps[i]()
    } else input = deps()
    if (defer) {
      defer = false
      return initialValue
    }
    const result = untrack(() => fn(input, prevInput, prevValue))
    prevInput = input
    return result
  }
}

export type Atom<T> = (<U extends T>(value: (prev: T) => U) => U) &
  (<U extends T>(value: Exclude<U, Function>) => U) &
  (<U extends T>(value: Exclude<U, Function> | ((prev: T) => U)) => U) &
  Accessor<T>

export function atom<T>(value: T, options?: SignalOptions<T>): Atom<T>
export function atom<T>(
  value?: undefined,
  options?: SignalOptions<T | undefined>,
): Atom<T | undefined>
export function atom<T>(value?: T, options?: SignalOptions<T | undefined>): Atom<T | undefined> {
  const [state, setState] = createSignal(value, { internal: true, ...options })
  return (...args: any[]) => (args.length === 1 ? setState(args[0]) : state())
}
