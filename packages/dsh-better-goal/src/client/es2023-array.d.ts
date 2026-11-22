// The host browser supports toReversed; keep the existing runtime call with an ES2022 build target.
interface Array<T> {
  toReversed(): T[]
}
