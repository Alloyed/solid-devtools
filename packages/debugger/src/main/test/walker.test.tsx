import {
  createComputed,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
} from 'solid-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { $SDT_ID, NodeType, TreeWalkerMode } from '../constants'
import { Mapped, Solid } from '../types'
import { getNodeName, getOwner } from '../utils'
import { ComputationUpdateHandler, walkSolidTree } from '../walker'

let mockLAST_ID = 0
beforeEach(() => {
  mockLAST_ID = 0
})
vi.mock('../../main/id', () => ({ getNewSdtId: () => mockLAST_ID++ + '' }))

const mockTree = () => {
  const [s] = createSignal('foo', { name: 's0' })
  createSignal('hello', { name: 's1' })

  createEffect(
    () => {
      createSignal({ bar: 'baz' }, { name: 's2' })
      createComputed(s, undefined, { name: 'c0' })
      createComputed(() => createSignal(0, { name: 's3' }), undefined, { name: 'c1' })
    },
    undefined,
    { name: 'e0' },
  )
}

describe('TreeWalkerMode.Owners', () => {
  it('default options', () => {
    {
      const [dispose, owner] = createRoot(dispose => {
        mockTree()
        return [dispose, getOwner()! as Solid.Root]
      })

      const tree = walkSolidTree(owner, {
        onComputationUpdate: () => {},
        rootId: (owner[$SDT_ID] = 'ff'),
        registerComponent: () => {},
        mode: TreeWalkerMode.Owners,
      })

      dispose()

      expect(tree).toEqual({
        id: 'ff',
        type: NodeType.Root,
        children: [
          {
            id: '0',
            name: 'e0',
            type: NodeType.Effect,
            frozen: true,
            children: [
              { id: '1', name: 'c0', type: NodeType.Computation, children: [] },
              { id: '2', name: 'c1', type: NodeType.Computation, frozen: true, children: [] },
            ],
          },
        ],
      } satisfies Mapped.Owner)
      expect(tree, 'is json serializable').toEqual(JSON.parse(JSON.stringify(tree)))
    }

    {
      createRoot(dispose => {
        const [s] = createSignal(0, { name: 'source' })

        const div = document.createElement('div')

        createComputed(
          () => {
            const focused = createMemo(
              () => {
                s()
                createSignal(div, { name: 'element' })
                const memo = createMemo(() => 0, undefined, { name: 'memo' })
                createRenderEffect(memo, undefined, { name: 'render' })
                return 'value'
              },
              undefined,
              { name: 'focused' },
            )
            focused()
          },
          undefined,
          { name: 'WRAPPER' },
        )

        const rootOwner = getOwner()! as Solid.Root
        const tree = walkSolidTree(rootOwner, {
          rootId: (rootOwner[$SDT_ID] = '0'),
          onComputationUpdate: () => {},
          registerComponent: () => {},
          mode: TreeWalkerMode.Owners,
        })

        expect(tree).toEqual({
          id: '0',
          type: NodeType.Root,
          children: [
            {
              id: '3',
              name: 'WRAPPER',
              type: NodeType.Computation,
              children: [
                {
                  id: '4',
                  name: 'focused',
                  type: NodeType.Memo,
                  children: [
                    { id: '5', name: 'memo', type: NodeType.Memo, frozen: true, children: [] },
                    { id: '6', type: NodeType.Render, children: [] },
                  ],
                },
              ],
            },
          ],
        } satisfies Mapped.Owner)

        dispose()
      })
    }
  })

  it('listen to computation updates', () => {
    createRoot(dispose => {
      const capturedComputationUpdates: Parameters<ComputationUpdateHandler>[] = []

      let computedOwner!: Solid.Owner
      const [a, setA] = createSignal(0)
      createComputed(() => {
        computedOwner = getOwner()!
        a()
      })

      const owner = getOwner()! as Solid.Root
      walkSolidTree(owner, {
        onComputationUpdate: (...a) => capturedComputationUpdates.push(a),
        rootId: (owner[$SDT_ID] = 'ff'),
        mode: TreeWalkerMode.Owners,
        registerComponent: () => {},
      })

      expect(capturedComputationUpdates.length).toBe(0)

      setA(1)

      expect(capturedComputationUpdates.length).toBe(1)
      expect(capturedComputationUpdates[0]).toEqual(['ff', computedOwner, false])

      dispose()
    })
  })

  it('gathers components', () => {
    createRoot(dispose => {
      const TestComponent = (props: { n: number }) => {
        const [a] = createSignal(0)
        createComputed(a)
        return <div>{props.n === 0 ? 'end' : <TestComponent n={props.n - 1} />}</div>
      }
      const Button = () => {
        return <button>Click me</button>
      }

      createRenderEffect(() => {
        return (
          <>
            <TestComponent n={5} />
            <Button />
          </>
        )
      })

      const owner = getOwner()! as Solid.Root

      const components: Solid.Component[] = []

      walkSolidTree(owner, {
        onComputationUpdate: () => {},
        rootId: (owner[$SDT_ID] = 'ff'),
        mode: TreeWalkerMode.Owners,
        registerComponent: c => components.push(c),
      })

      expect(components.length).toBe(7)

      let testCompsLength = 0
      let btn!: Solid.Component
      components.forEach(c => {
        if (getNodeName(c) === 'TestComponent') testCompsLength++
        else if (getNodeName(c) === 'Button') btn = c
      })
      expect(testCompsLength).toBe(6)
      expect(btn).toBeTruthy()

      dispose()
    })
  })
})

describe('TreeWalkerMode.Components', () => {
  it('map component tree', () => {
    const toTrigger: VoidFunction[] = []
    const testComponents: Solid.Component[] = []

    createRoot(dispose => {
      const Wrapper = (props: { children: any }) => {
        return <div>{props.children}</div>
      }
      const TestComponent = (props: { n: number }) => {
        const [a, set] = createSignal(0)
        createComputed(a)
        toTrigger.push(() => set(1))
        testComponents.push(getOwner()! as Solid.Component)
        // * this is a hack to get the subroots
        // * normally subroots are attached by a separate module
        const subroots: Solid.Root[] = (getOwner()!.sdtSubRoots = [])
        return createRoot(_ => {
          subroots.push(getOwner()! as Solid.Root)
          return <div>{props.n === 0 ? 'end' : <TestComponent n={props.n - 1} />}</div>
        })
      }
      const Button = () => {
        return <button>Click me</button>
      }

      createRenderEffect(() => {
        return (
          <>
            <Wrapper>
              <TestComponent n={3} />
              <Button />
            </Wrapper>
          </>
        )
      })

      const owner = getOwner()! as Solid.Root

      const computationUpdates: Parameters<ComputationUpdateHandler>[] = []

      const tree = walkSolidTree(owner, {
        onComputationUpdate: (...a) => computationUpdates.push(a),
        rootId: (owner[$SDT_ID] = 'ff'),
        mode: TreeWalkerMode.Components,
        registerComponent: () => {},
      })

      expect(tree).toMatchObject({
        type: NodeType.Root,
        children: [
          {
            type: NodeType.Component,
            name: 'Wrapper',
            children: [
              {
                type: NodeType.Component,
                name: 'TestComponent',
                children: [
                  {
                    type: NodeType.Component,
                    name: 'TestComponent',
                    children: [
                      {
                        type: NodeType.Component,
                        name: 'TestComponent',
                        children: [
                          {
                            type: NodeType.Component,
                            name: 'TestComponent',
                            children: [],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: NodeType.Component,
                name: 'Button',
                children: [],
              },
            ],
          },
        ],
      })

      expect(computationUpdates.length).toBe(0)

      toTrigger.forEach(t => t())

      expect(computationUpdates.length).toBe(4)

      for (let i = 0; i < 4; i++) {
        expect(computationUpdates[i]).toEqual(['ff', testComponents[i], false])
      }

      dispose()
    })
  })
})

describe('TreeWalkerMode.DOM', () => {
  it('map dom tree', () => {
    const toTrigger: VoidFunction[] = []
    const testComponents: Solid.Component[] = []

    createRoot(dispose => {
      const Wrapper = (props: { children: any }) => {
        return <div>{props.children}</div>
      }
      const TestComponent = (props: { n: number }) => {
        const [a, set] = createSignal(0)
        createComputed(a)
        toTrigger.push(() => set(1))
        testComponents.push(getOwner()! as Solid.Component)
        // * this is a hack to get the subroots
        // * normally subroots are attached by a separate module
        const subroots: Solid.Root[] = (getOwner()!.sdtSubRoots = [])
        return createRoot(_ => {
          subroots.push(getOwner()! as Solid.Root)
          return <div>{props.n === 0 ? 'end' : <TestComponent n={props.n - 1} />}</div>
        })
      }
      const Button = () => {
        return <button>Click me</button>
      }
      const App = () => {
        return (
          <>
            <Wrapper>
              <main>
                <TestComponent n={2} />
                <Button />
              </main>
            </Wrapper>
            <footer />
          </>
        )
      }
      createRenderEffect(() => <App />)

      const owner = getOwner()! as Solid.Root

      const computationUpdates: Parameters<ComputationUpdateHandler>[] = []

      const tree = walkSolidTree(owner, {
        onComputationUpdate: (...a) => computationUpdates.push(a),
        rootId: (owner[$SDT_ID] = 'ff'),
        mode: TreeWalkerMode.DOM,
        registerComponent: () => {},
      })

      expect(tree).toMatchObject({
        type: NodeType.Root,
        children: [
          {
            type: NodeType.Component,
            name: 'App',
            children: [
              {
                type: NodeType.Component,
                name: 'Wrapper',
                children: [
                  {
                    type: NodeType.Element,
                    name: 'div',
                    children: [
                      {
                        type: NodeType.Element,
                        name: 'main',
                        children: [
                          {
                            type: NodeType.Component,
                            name: 'TestComponent',
                            children: [
                              {
                                type: NodeType.Element,
                                name: 'div',
                                children: [
                                  {
                                    type: NodeType.Component,
                                    name: 'TestComponent',
                                    children: [
                                      {
                                        type: NodeType.Element,
                                        name: 'div',
                                        children: [
                                          {
                                            type: NodeType.Component,
                                            name: 'TestComponent',
                                            children: [
                                              {
                                                type: NodeType.Element,
                                                name: 'div',
                                                children: [],
                                              },
                                            ],
                                          },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            type: NodeType.Component,
                            name: 'Button',
                            children: [
                              {
                                type: NodeType.Element,
                                name: 'button',
                                children: [],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: NodeType.Element,
                name: 'footer',
                children: [],
              },
            ],
          },
        ],
      })

      expect(computationUpdates.length).toBe(0)

      toTrigger.forEach(t => t())

      for (let i = 0; i < 3; i++) {
        expect(computationUpdates[i]).toEqual(['ff', testComponents[i], true])
      }

      dispose()
    })
  })
})
