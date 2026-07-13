/**
 * engine/nodes/xa-destination.js — PlecoAudioDestinationNode.
 *
 * The graph's sole pull entry point. Its _tick() sums its inputs into the final
 * mix for the quantum (inherited pull-and-sum behavior); the context's
 * renderQuantum() calls it once per block.
 */
import { PlecoNode } from '../xa-node.js'

export class PlecoAudioDestinationNode extends PlecoNode {
  constructor(context, options = {}) {
    // Spec (§ AudioDestinationNode): 1 in / 1 out, channelCountMode 'explicit',
    // channelInterpretation 'speakers' — the input always mixes to exactly
    // channelCount channels (the context's channel count). The output exists so
    // the summed mix can be captured (spec: "produced by summing its input");
    // its block is simply the node's _tick() result.
    super(context, {
      channelCount: 1,
      ...options,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCountMode: 'explicit',
    })
  }
}
