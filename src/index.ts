import { createDraft, finishDraft } from 'immer'
import {
  State,
  LogType,
  BaseActions,
  BaseEffects,
  Store,
  Config,
  Options,
} from './types'
import { log, configureUtils } from './utils'
export {
  createStateHook,
  createActionsHook,
  createSelectorHook,
  useState,
  useActions,
  useSelector,
} from './hooks'
export { Provider } from './provider'
export { IAction } from './types'

// Creates the updated state and a list of paths changed after batched mutations
function getUpdate(draft) {
  const paths = new Set<string>()

  const newState = finishDraft(draft, (operations) => {
    operations.forEach((operation) => {
      // When a key/index is added to an object/array the path to the object/array itself also has a change
      if (operation.op === 'add' || operation.op === 'remove') {
        paths.add(operation.path.slice(0, operation.path.length - 1).join('.'))
      }

      paths.add(operation.path.join('.'))
    })
  })

  return { newState, paths }
}

// Creates a nested structure and handling functions with a factory
// Used by actions and computed
function createNestedStructure(
  structure: object,
  factory: (target: object, key: string, path: string, func: Function) => any,
  path: string[] = []
) {
  return Object.keys(structure).reduce((aggr, key) => {
    const funcOrNested = structure[key]
    const newPath = path.concat(key)

    if (typeof funcOrNested === 'function') {
      return factory(aggr, key, newPath.join('.'), funcOrNested)
    }

    return Object.assign(aggr, {
      [key]: createNestedStructure(funcOrNested, factory, newPath),
    })
  }, {})
}

// Creates the store itself by preparing the state, converting actions to callable
// functions and manage their execution to notify state changes
export function createStore<
  S extends State,
  E extends BaseEffects,
  A extends BaseActions<S, E>
>(config: Config<S, E, A>, options: Options = { debug: true }): Store<S, E, A> {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test'
  ) {
    options.debug = false
  }

  configureUtils(options)

  let currentState = finishDraft(createDraft(config.state))
  const pathListeners = {}
  const globalListeners: Function[] = []

  // Allows components to subscribe by passing in the paths they are tracking
  function subscribe(update: () => void, paths?: Set<string>, name?: string) {
    // When a component listens to specific paths we create a subscription
    if (paths) {
      const currentPaths = Array.from(paths)
      const subscription = {
        update,
        name,
      }
      // The created subscription is added to each path
      // that it is interested
      currentPaths.forEach((path) => {
        if (!pathListeners[path]) {
          pathListeners[path] = []
        }
        pathListeners[path].push(subscription)
      })

      // We return a dispose function to remove the subscription from the paths
      return () => {
        currentPaths.forEach((path) => {
          pathListeners[path].splice(
            pathListeners[path].indexOf(subscription),
            1
          )
        })
      }
      // Selectors just listens to any update as it uses immutability to compare values
    } else {
      globalListeners.push(update)

      return () => {
        globalListeners.splice(globalListeners.indexOf(update), 1)
      }
    }
  }

  // Is used when mutations has been tracked and any subscribers should be notified
  function updateListeners(paths: Set<string>) {
    paths.forEach((path) => {
      if (pathListeners[path]) {
        pathListeners[path].forEach((subscription) => {
          log(
            LogType.RENDER,
            `component "${subscription.name}" due to change on "${path}"`
          )
          subscription.update()
        })
      }
    })
    globalListeners.forEach((update) => update())
  }

  // Creates a new version of the state and passes any paths
  // affected to notify subscribers
  function flushMutations(draft, actionName) {
    const { paths, newState } = getUpdate(draft)

    currentState = newState
    log(LogType.MUTATIONS, `from "${actionName}" - ${Array.from(paths)}`)
    updateListeners(paths)
  }

  function createAction(
    target: object,
    key: string,
    name: string,
    func: (...args) => any
  ) {
    target[key] = (payload) => {
      // We keep track of the current draft. It may change during async execution
      let currentDraft
      // We also keep track of a timeout as there might be multiple async steps where
      // we want to flush out mutations
      let timeout

      // Used when accessing state to ensure we have a draft and prepare
      // any async updates
      function configureUpdate() {
        if (!currentDraft) {
          currentDraft = createDraft(currentState)
        }
        clearTimeout(timeout)
        timeout = setTimeout(() => {
          flushMutations(currentDraft, name)
          currentDraft = null
        })
      }

      // We call the defined function passing in the "context"
      const actionResult = func(
        {
          // We create a proxy so that we can prepare a new draft for the action no matter what.
          // If we are just pointing into state, deleting a root property or setting a root property
          state: new Proxy(
            {},
            {
              get(_, prop) {
                configureUpdate()
                return currentDraft[prop]
              },
              deleteProperty(_, prop) {
                configureUpdate()
                return Reflect.deleteProperty(currentDraft, prop)
              },
              set(_, prop, ...rest) {
                configureUpdate()
                return Reflect.set(currentDraft, prop, ...rest)
              },
            }
          ),
          // We also pass in the effects
          // TODO: Use a proxy tracker here as well to track effects being called
          effects: config.effects,
        },
        payload
      )

      // If the action returns a promise (probalby async) we wait for it to finish.
      // This indicates that it is time to flush out any mutations
      if (actionResult instanceof Promise) {
        actionResult
          .then(() => {
            clearTimeout(timeout)
            if (currentDraft) {
              flushMutations(currentDraft, name)
              currentDraft = null
            }
          })
          .catch((error) => {
            // There is a caveat. If you are to change state asynchronously you have to point to the
            // actual state object object again, this is to activate a new draft. We could wrap this
            // with proxies again, but seems unnecessary
            if (error.message.indexOf('proxy that has been revoked') > 0) {
              const message = `You are asynchronously changing state in the action "${name}". Make sure you point to "state" again as the previous state draft has been disposed`

              throw new Error(message)
            }

            throw error
          })
        // If the action is done we can immediately flush out mutations
      } else if (currentDraft) {
        clearTimeout(timeout)
        flushMutations(currentDraft, name)
        currentDraft = null
      } else {
        clearTimeout(timeout)
      }

      return actionResult
    }

    return target
  }

  const actions = config.actions || {}

  return {
    // Exposes the immutable state on the instance
    get state() {
      return currentState
    },
    subscribe,
    actions: createNestedStructure(actions, createAction),
  }
}
