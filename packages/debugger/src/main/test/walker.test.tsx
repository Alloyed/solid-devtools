import { describe, beforeEach, vi, it, expect } from 'vitest'
import {
  createComputed,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
} from 'solid-js'
import { getNodeName, getOwner } from '../utils'
import { Solid, Mapped } from '../types'
import { NodeType, TreeWalkerMode } from '../constants'
import { ComputationUpdateHandler } from '../walker'

const getModule = async () => (await import('../walker')).walkSolidTree

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
  beforeEach(() => {
    delete (window as any).Solid$$
    vi.resetModules()
  })

  it('default options', async () => {
    const walkSolidTree = await getModule()

    {
      const [dispose, owner] = createRoot(dispose => {
        mockTree()
        return [dispose, getOwner()! as Solid.Root]
      })

      const tree = walkSolidTree(owner, {
        onComputationUpdate: () => {},
        rootId: (owner.sdtId = 'ff'),
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
          rootId: (rootOwner.sdtId = '0'),
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

  it('listen to computation updates', async () => {
    const walkSolidTree = await getModule()

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
        rootId: (owner.sdtId = 'ff'),
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

  it('gathers components', async () => {
    const walkSolidTree = await getModule()

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
        rootId: (owner.sdtId = 'ff'),
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
