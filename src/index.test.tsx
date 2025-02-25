import {
  createStore,
  createStateHook,
  Provider,
  createSelectorHook,
  IAction,
} from './'
import * as React from 'react'
import * as renderer from 'react-test-renderer'
import { createSelector } from 'reselect'

describe('React', () => {
  test('should allow using hooks', () => {
    let renderCount = 0
    const config = {
      state: {
        foo: 'bar',
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo += '!'
        },
      },
    }
    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      renderCount++

      return <h1>{state.foo}</h1>
    }

    const tree = renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    expect(renderCount).toBe(1)

    renderer.act(() => {
      store.actions.updateFoo()
    })

    expect(renderCount).toBe(2)
    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should handle arrays', () => {
    const config = {
      state: {
        foo: ['foo', 'bar'],
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo.push('baz')
        },
      },
    }
    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      return (
        <ul>
          {state.foo.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )
    }

    const tree = renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    expect(tree).toMatchSnapshot()

    renderer.act(() => {
      store.actions.updateFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should render on object add and remove', () => {
    const addFoo: Action = ({ state }) => {
      state.object.foo = 'bar'
    }

    const removeFoo: Action = ({ state }) => {
      delete state.object.foo
    }

    const config = {
      state: {
        object: {} as { [key: string]: string },
      },
      actions: {
        addFoo,
        removeFoo,
      },
    }

    interface Action<Payload = void> extends IAction<Payload, typeof config> {}

    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const state = useState()

      return <h1>{state.object.foo ? state.object.foo : 'does not exist'}</h1>
    }

    const tree = renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    expect(tree).toMatchSnapshot()

    renderer.act(() => {
      store.actions.addFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()

    renderer.act(() => {
      store.actions.removeFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should target state', () => {
    const config = {
      state: {
        foo: ['foo', 'bar'],
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo.push('baz')
        },
      },
    }

    const useState = createStateHook<typeof config>()
    const store = createStore(config)
    const FooComponent: React.FunctionComponent = () => {
      const foo = useState((state) => state.foo)

      return (
        <ul>
          {foo.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )
    }

    const tree = renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    expect(tree).toMatchSnapshot()

    renderer.act(() => {
      store.actions.updateFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
  test('should allow usage of reselect', () => {
    const config = {
      state: {
        foo: ['foo', 'bar'],
      },
      actions: {
        updateFoo: ({ state }) => {
          state.foo.push('baz')
        },
      },
    }

    const useSelector = createSelectorHook<typeof config>()
    const store = createStore(config)

    const getFoo = (state: typeof config['state']) => state.foo
    const upperFooSelector = createSelector(
      [getFoo],
      (foo) => foo.map((text) => text.toUpperCase())
    )

    const FooComponent: React.FunctionComponent = () => {
      const upperFoo = useSelector(upperFooSelector)

      return (
        <ul>
          {upperFoo.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )
    }

    const tree = renderer.create(
      <Provider store={store}>
        <FooComponent />
      </Provider>
    )

    expect(tree).toMatchSnapshot()

    renderer.act(() => {
      store.actions.updateFoo()
    })

    expect(tree.toJSON()).toMatchSnapshot()
  })
})
