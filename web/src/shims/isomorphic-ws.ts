// SPDX-License-Identifier: Apache-2.0
//
// `isomorphic-ws`'s browser entry only has a default export, but
// @midnight-ntwrk/midnight-js-indexer-public-data-provider imports it as a
// *named* export (`import { WebSocket } from 'isomorphic-ws'`). Bundling that
// as-is leaves WebSocket undefined at runtime, which breaks the indexer's
// GraphQL subscriptions (the live tally). Vite aliases the package to this
// module, which provides both shapes over the browser's native WebSocket.

const NativeWebSocket = globalThis.WebSocket;

export { NativeWebSocket as WebSocket };
export default NativeWebSocket;
