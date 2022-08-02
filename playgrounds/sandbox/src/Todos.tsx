import { debugProps, debugStore } from "@solid-devtools/logger"
import { createEffect, createSignal, batch, For, Component } from "solid-js"
import { reconcile } from "solid-js/store"
import * as Store from "solid-js/store"

export function createLocalStore<T extends object>(
	name: string,
	init: T,
): [Store.Store<T>, Store.SetStoreFunction<T>] {
	const localState = localStorage.getItem(name)
	const [state, setState] = Store.createStore<T>(localState ? JSON.parse(localState) : init)
	createEffect(() => localStorage.setItem(name, JSON.stringify(state)))
	return [state, setState]
}

export function removeIndex<T>(array: readonly T[], index: number): T[] {
	return [...array.slice(0, index), ...array.slice(index + 1)]
}

type TodoItem = { title: string; done: boolean }

const Todo: Component<{
	done: boolean
	title: string
	onCheck: (value: boolean) => void
	onUpdate: (value: string) => void
	onRemove: VoidFunction
}> = props => {
	// debugProps(props)

	return (
		<div>
			<input
				type="checkbox"
				checked={props.done}
				onChange={e => props.onCheck(e.currentTarget.checked)}
			/>
			<input
				type="text"
				value={props.title}
				onChange={e => props.onUpdate(e.currentTarget.value)}
			/>
			<button onClick={props.onRemove}>x</button>
		</div>
	)
}

const Todos: Component = () => {
	const [newTitle, setTitle] = createSignal("")
	const [todos, setTodos] = createLocalStore<TodoItem[]>("todos", [])

	// debugStore(todos)

	const addTodo = (e: SubmitEvent) => {
		e.preventDefault()
		batch(() => {
			setTodos(todos.length, {
				title: newTitle(),
				done: false,
			})
			setTitle("")
		})
	}

	// setTimeout(() => {
	// 	setTodos(
	// 		0,
	// 		reconcile({
	// 			title: "Learn Solid-JS",
	// 			done: false,
	// 			[Math.random() + ""]: "hello",
	// 		}),
	// 	)
	// }, 1000)

	return (
		<>
			<h3>Simple Todos Example</h3>
			<form onSubmit={addTodo}>
				<input
					placeholder="enter todo and click +"
					required
					value={newTitle()}
					onInput={e => setTitle(e.currentTarget.value)}
				/>
				<button>+</button>
			</form>
			<For each={todos}>
				{(todo, i) => (
					<Todo
						{...todo}
						onCheck={v => setTodos(i(), "done", v)}
						onUpdate={v => setTodos(i(), "title", v)}
						onRemove={() => setTodos(t => removeIndex(t, i()))}
					/>
				)}
			</For>
		</>
	)
}
export default Todos
