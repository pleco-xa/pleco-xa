- Lets remmeber where we are and our plane, so in the case of a crash we are on the same page still
- check your fucking work
- dont use bpm_detector.js because we have librose-tempo now
- remember those key combos and stuff and last updates we did

## DEBUG History & Lessons Learned

### Issue: Loop Controls Not Working (January 2025)

**Problem:** Half Loop and Move Forward buttons wouldn't immediately change audio playback during live playback.

**Wrong Approaches Tried:**

1. **Manual Web Audio Looping:** Attempted to use `currentSource.loopStart` and `loopEnd` properties with manual scheduling - these properties don't work reliably for dynamic loop changes
2. **Complex Manual Loop System:** Built `startManualLoop()` with `setTimeout` scheduling - overcomplicated and introduced timing issues
3. **Immediate Audio Source Replacement:** Tried to stop/restart audio sources with new loop bounds - Web Audio API doesn't handle this gracefully

**Root Cause:** Simple JavaScript typo in BPM recalculation function:

- `bmpResult.bmp.toFixed()` should have been `bpmResult.bpm.toFixed()`
- This typo caused function to crash, preventing the simple stop/play restart from executing

**Correct Solution:**

- Simple stop/play with 50ms setTimeout: `stopAudio(); setTimeout(() => playAudio(), 50)`
- Fixed the typo: `bmpResult.bmp` → `bpmResult.bpm`
- Audio now immediately changes to new loop bounds when buttons are clicked

**Lesson:** Sometimes the simplest solution is correct. Don't overcomplicate when a basic approach should work - check for typos first before building complex alternatives.