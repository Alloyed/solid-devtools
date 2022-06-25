import { makeTimer } from "@solid-primitives/timer"
import { attachDebugger } from "solid-devtools"
import { debugComputation } from "@solid-devtools/logger"
import {
	Component,
	createSignal,
	createEffect,
	createMemo,
	getOwner,
	Show,
	createComputed,
	runWithOwner,
	Setter,
	ParentComponent,
	Accessor,
	createRoot,
	batch,
} from "solid-js"
import Todos from "./Todos"

const doMediumCalc = () => {
	Array.from({ length: 1000000 }, (_, i) => i).sort(() => Math.random() - 5)
}

let setRootCount: Setter<number>
let disposeOuterRoot: VoidFunction

createRoot(dispose => {
	disposeOuterRoot = dispose
	// reattachOwner()

	getOwner()!.name = "OUTSIDE_ROOT"

	const [count, setCount] = createSignal(0)
	setRootCount = setCount

	createEffect(() => {
		count()
		if (count() === 1) {
			createRoot(dispose => {
				attachDebugger()
				getOwner()!.name = "OUTSIDE_TEMP_ROOT"

				createEffect(() => count() === 4 && dispose())

				createRoot(_ => {
					getOwner()!.name = "OUTSIDE_INSIDE_ROOT"
					attachDebugger()
					createEffect(() => count())
				})
			})
		}
	})
})

const Button = (props: { text: string; onClick: VoidFunction }) => {
	// createRoot(dispose => {
	// 	reattachOwner()
	// 	createComputed(() => {}, undefined, { name: "HEYYY, I should BE DEAD" })
	// 	setTimeout(dispose, 2000)
	// })

	const text = createMemo(() => <span>{props.text}</span>)
	return (
		<button aria-label={props.text} onClick={props.onClick}>
			{text()}
		</button>
	)
}

const PassChildren: ParentComponent = props => {
	return props.children
}

const Article: Component = () => {
	return (
		<article>
			<h3>A cool headline for testing :)</h3>
			<p>
				Lorem ipsum dolor sit amet, consectetur adipisicing elit. Dolorem odio culpa vel vitae? Quis
				deleniti soluta rem velit necessitatibus?{" "}
				<PassChildren>
					<b>
						Saepe nulla omnis nobis minima perferendis odio doloremque deleniti dolore corrupti.
					</b>
				</PassChildren>
			</p>
		</article>
	)
}

const obj = {
	comp: () => <div>This is an object property component</div>,
}

const App: Component = () => {
	const [count, setCount] = createSignal(0, { name: "count_sig" })
	const [showEven, setShowEven] = createSignal(false, { name: "showEven" })

	const dispose = createRoot(dispose => {
		attachDebugger()
		createComputed(
			_ => {
				debugComputation()

				// showEven()
				createSignal("hello")
				setShowEven(count() % 2 === 0)
				if (count() === 2) {
					doMediumCalc()
					setCount(p => p + 1)
					createComputed(
						() => {
							count()
						},
						undefined,
						{ name: "run 2" },
					)
				}
				return count()
			},
			undefined,
			{ name: "main_computed" },
		)
		return dispose
	})

	// batch(() => {
	// 	setCount(1)
	// 	setShowEven(true)
	// })

	createEffect(() => {
		console.log("effect")
		count()
	})

	// add signal asynchronously
	const owner = getOwner()!
	setTimeout(() => {
		runWithOwner(owner, () => {
			createSignal("I am here too!", { name: "async" })
		})
	})

	let setMe: Setter<string>
	const [smiley, setSmiley] = createSignal<Accessor<string>>()
	makeTimer(() => setMe(["🙂", "🤔", "🤯"][Math.floor(Math.random() * 3)]), 2000, setInterval)
	createEffect(
		() => {
			const [_smiley, _setMe] = createSignal("🙂", { name: "smiley" })
			setMe = _setMe
			setSmiley(() => _smiley)
			console.log(count())
		},
		undefined,
		{ name: "EFFECT" },
	)

	return (
		<>
			<h1>Welcome to the Sandbox</h1>
			<div>
				<header>
					<Button onClick={() => setCount(p => ++p)} text={`Count: ${count()}`} />
					<Button onClick={() => setCount(p => ++p)} text={`Count: ${count()}`} />
				</header>
				<p>Dispose computation</p>
				<button onClick={dispose}>Dispose</button>
				<div>
					<Show when={showEven()}>{count()} is even!</Show>
				</div>
				<div>
					<PassChildren>
						<Show when={showEven()} fallback={<p>\\{smiley()}/</p>}>
							<p style={{ background: "darkgray" }}>{smiley()}</p>
						</Show>
					</PassChildren>
				</div>
			</div>
			<obj.comp />
			<button onClick={() => setRootCount(p => ++p)}>Update root count</button>
			<button onClick={() => disposeOuterRoot()}>Dispose Outer Root</button>
			<Article />
			<Todos />
		</>
	)
}

export default App
