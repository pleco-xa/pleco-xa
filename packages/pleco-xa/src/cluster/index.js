/**
 * Pleco-XA cluster domain — scikit-learn-compatible surface.
 *
 * Currently exposes K-means clustering (Lloyd + greedy k-means++), matching
 * `sklearn.cluster.KMeans`. Validated against committed reference fixtures.
 *
 * Reference source read in full: sklearn/cluster/_kmeans.py
 * (`_kmeans_plusplus` l.180, `_tolerance` l.285, `_kmeans_single_lloyd` l.630).
 */

export { kmeans } from './kmeans.js'
