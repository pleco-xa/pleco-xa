/**
 * engine/nodes/xa-destination.js — PlecoAudioDestinationNode.
 *
 * The graph's sole pull entry point. Its _tick() sums its inputs into the final
 * mix for the quantum (inherited pull-and-sum behavior); the context's
 * renderQuantum() calls it once per block.
 */
import { PlecoNode } from '../xa-node.js'

export class PlecoAudioDestinationNode extends PlecoNode {
  constructor(context, { channelCount = 1 } = {}) {
    super(context, { numberOfInputs: 1, numberOfOutputs: 0, channelCount })
  }
}
