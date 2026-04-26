import { Ionicons } from '@expo/vector-icons';
import { CameraView, type CameraCapturedPicture, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SecurityGateProps {
  onVerified: (method: string) => Promise<void> | void;
}

type ChallengeKey = 'blink' | 'turn-left' | 'turn-right' | 'smile';

type ChallengeStep = {
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  key: ChallengeKey;
  title: string;
};

const CHALLENGE_POOL: ChallengeStep[] = [
  {
    key: 'blink',
    title: 'Blink twice',
    hint: 'Keep your face inside the frame, then blink naturally two times.',
    icon: 'eye-outline',
  },
  {
    key: 'turn-left',
    title: 'Turn slightly left',
    hint: 'Rotate your head a little to your left, then face the camera again.',
    icon: 'arrow-undo-outline',
  },
  {
    key: 'turn-right',
    title: 'Turn slightly right',
    hint: 'Rotate your head a little to your right, then face the camera again.',
    icon: 'arrow-redo-outline',
  },
  {
    key: 'smile',
    title: 'Smile once',
    hint: 'Show a quick smile before the capture completes.',
    icon: 'happy-outline',
  },
];

const CHALLENGE_COUNT = 3;
const CAPTURE_COUNTDOWN_SECONDS = 3;
const SESSION_DURATION_SECONDS = 45;

export function SecurityGate({ onVerified }: SecurityGateProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallPhone = width < 360;
  const isShortPhone = height < 700;
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasBiometricUnlock, setHasBiometricUnlock] = useState(false);
  const [success, setSuccess] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [message, setMessage] = useState('Capture each randomized prompt before the timer expires.');
  const [pendingMethod, setPendingMethod] = useState('local_challenge');
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(SESSION_DURATION_SECONDS);
  const [challengeSteps, setChallengeSteps] = useState<ChallengeStep[]>(() => createChallengeSequence());
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [cameraReady, setCameraReady] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<CameraView | null>(null);
  const evidenceUrisRef = useRef<string[]>([]);

  const horizontalPadding = isSmallPhone ? 16 : 22;
  const contentWidth = Math.min(width - horizontalPadding * 2, 420);
  const frameSize = Math.min(contentWidth - (isSmallPhone ? 18 : 10), isShortPhone ? 210 : 250);
  const innerFrameSize = frameSize - 18;
  const topInset = Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : Math.max(insets.top, 14);
  const bottomInset = Platform.OS === 'ios' ? Math.max(insets.bottom, 28) : 12;
  const reviewMode = currentStepIndex >= challengeSteps.length;
  const activeStep = challengeSteps[Math.min(currentStepIndex, challengeSteps.length - 1)];
  const busy = captureBusy || biometricBusy;

  useEffect(() => {
    evidenceUrisRef.current = evidenceUris;
  }, [evidenceUris]);

  useEffect(() => {
    let mounted = true;

    async function prepare() {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;

        if (mounted) {
          setHasBiometricUnlock(hasHardware && enrolled);
        }
      } catch {
        if (mounted) {
          setHasBiometricUnlock(false);
        }
      }
    }

    prepare().catch(() => setHasBiometricUnlock(false));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!cameraPermission?.granted || success || reviewMode) {
      return;
    }

    const interval = setInterval(() => {
      setSessionSecondsLeft((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [cameraPermission?.granted, reviewMode, success]);

  useEffect(() => {
    if (success || reviewMode || sessionSecondsLeft > 0) {
      return;
    }

    resetChallenge('The local check timed out. We started a new challenge.');
  }, [reviewMode, sessionSecondsLeft, success]);

  useEffect(() => {
    return () => {
      void clearEvidence(evidenceUrisRef.current);
    };
  }, []);

  if (success) {
    return (
      <SuccessScreen
        progressAnim={progressAnim}
        onContinue={() => onVerified(pendingMethod)}
      />
    );
  }

  if (!cameraPermission) {
    return <View style={styles.loadingScreen} />;
  }

  return (
    <ScrollView
      bounces={false}
      contentContainerStyle={[
        styles.screen,
        {
          paddingBottom: 24 + bottomInset,
          paddingHorizontal: horizontalPadding,
          paddingTop: 18 + topInset,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.content, { maxWidth: contentWidth }]}>
        {!cameraPermission.granted ? (
          <>
            <View style={styles.topIcon}>
              <Ionicons name="scan-outline" size={24} color={COLOR.primary} />
            </View>

            <Text style={[styles.title, isSmallPhone && styles.titleCompact]}>Local Presence Check</Text>
            <Text style={[styles.subtitle, isSmallPhone && styles.subtitleCompact]}>
              This on-device challenge uses the front camera and randomized prompts. It helps deter casual spoofing, but it
              is not a provider-grade liveness check.
            </Text>

            <View style={styles.permissionCard}>
              <View style={styles.permissionIcon}>
                <Ionicons name="camera-outline" size={26} color={COLOR.primaryDark} />
              </View>
              <Text style={styles.permissionTitle}>Camera permission required</Text>
              <Text style={styles.permissionBody}>
                Allow camera access to run the local challenge flow and capture short verification frames on this device.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  requestCameraPermission().catch(() => {
                    setMessage('Camera permission was not granted.');
                  });
                }}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.primaryButtonText}>Grant Camera Access</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.title, isSmallPhone && styles.titleCompact, { marginBottom: 12, fontSize: isSmallPhone ? 20 : 22 }]}>Local Presence Check</Text>
            <View style={styles.sessionHeader}>
              <View style={styles.sessionBadge}>
                <Ionicons name="timer-outline" size={16} color={COLOR.primaryDark} />
                <Text style={styles.sessionBadgeText}>{formatTimer(sessionSecondsLeft)} remaining</Text>
              </View>
              <Text style={styles.sessionCaption}>3-step local challenge</Text>
            </View>

            <View style={[styles.cameraFrame, { borderRadius: frameSize / 2, height: frameSize, width: frameSize }]}>
              <CameraView
                active
                animateShutter={false}
                facing="front"
                mirror
                mode="picture"
                onCameraReady={() => setCameraReady(true)}
                ref={cameraRef}
                style={[
                  styles.cameraPreview,
                  { borderRadius: innerFrameSize / 2, height: innerFrameSize, width: innerFrameSize },
                ]}
              />
              <View pointerEvents="none" style={[styles.cameraOverlayRing, { borderRadius: frameSize / 2 }]} />
              <View pointerEvents="none" style={styles.cameraOverlayCrosshair} />
              {!cameraReady ? (
                <View style={styles.cameraLoading}>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.cameraLoadingText}>Starting camera…</Text>
                </View>
              ) : null}
              {countdown ? (
                <View style={styles.countdownBubble}>
                  <Text style={styles.countdownText}>{countdown}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.challengeCard}>
              <View style={styles.challengeCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.challengeLabel}>
                    {reviewMode ? 'REVIEW' : `STEP ${currentStepIndex + 1} OF ${challengeSteps.length}`}
                  </Text>
                  <Text style={styles.challengeTitle}>
                    {reviewMode ? 'All prompts captured' : activeStep?.title}
                  </Text>
                </View>
                <View style={styles.challengeIconWrap}>
                  <Ionicons
                    name={reviewMode ? 'checkmark-done-outline' : activeStep?.icon ?? 'scan-outline'}
                    size={22}
                    color={COLOR.primary}
                  />
                </View>
              </View>

              <Text style={styles.challengeHintText}>
                {reviewMode ? 'You can now securely finish the local presence check using your device biometrics.' : activeStep?.hint}
              </Text>

              <View style={styles.challengeDotsRow}>
                {challengeSteps.map((step, index) => (
                  <View
                    key={step.key}
                    style={[
                      styles.challengeDot,
                      index < currentStepIndex && styles.challengeDotDone,
                      index === currentStepIndex && !reviewMode && styles.challengeDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.statusTextWrap}>
              <Text style={styles.statusText}>{message || ' '}</Text>
            </View>

            {!reviewMode ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy || !cameraReady}
                onPress={captureCurrentStep}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (busy || !cameraReady) && styles.primaryButtonDisabled,
                  pressed && !(busy || !cameraReady) && styles.pressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {captureBusy ? 'Capturing…' : `Capture ${activeStep?.title ?? 'Step'}`}
                </Text>
                {!captureBusy ? <Ionicons name="camera-outline" size={18} color="#FFFFFF" /> : null}
              </Pressable>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={hasBiometricUnlock ? finishWithDeviceUnlock : finishLocalOnly}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    busy && styles.primaryButtonDisabled,
                    pressed && !busy && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>
                    {biometricBusy
                      ? 'Checking device unlock…'
                      : hasBiometricUnlock
                        ? 'Finish With Device Unlock'
                        : 'Finish Local Check'}
                  </Text>
                  {!biometricBusy ? (
                    <Ionicons
                      name={hasBiometricUnlock ? 'lock-closed-outline' : 'checkmark-circle-outline'}
                      size={18}
                      color="#FFFFFF"
                    />
                  ) : null}
                </Pressable>

                {hasBiometricUnlock ? (
                  <Pressable accessibilityRole="button" onPress={finishLocalOnly} style={styles.secondaryAction}>
                    <Text style={styles.secondaryActionText}>Finish Without Device Biometrics</Text>
                  </Pressable>
                ) : null}
              </>
            )}

            <Pressable accessibilityRole="button" onPress={() => resetChallenge('Challenge restarted.')} style={styles.cancelButton}>
              <Text style={styles.cancelText}>{reviewMode ? 'Run Another Check' : 'Restart Challenge'}</Text>
            </Pressable>

            {__DEV__ ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPendingMethod('development');
                  setSuccess(true);
                  startProgressAnimation();
                  setTimeout(() => onVerified('development'), 2200);
                }}
                style={styles.devButton}
              >
                <Text style={styles.devButtonText}>Skip (Dev)</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </ScrollView>
  );

  async function captureCurrentStep() {
    if (captureBusy || reviewMode) {
      return;
    }

    if (!cameraReady || !cameraRef.current) {
      setMessage('Camera is still starting. Wait a moment and try again.');
      return;
    }

    setCaptureBusy(true);
    setMessage(`Hold still while we capture “${activeStep?.title}”.`);

    try {
      for (let value = CAPTURE_COUNTDOWN_SECONDS; value >= 1; value -= 1) {
        setCountdown(value);
        await delay(700);
      }

      const picture = (await cameraRef.current.takePictureAsync({
        quality: 0.35,
        shutterSound: false,
        skipProcessing: true,
      })) as CameraCapturedPicture | undefined;

      setCountdown(null);

      if (picture?.uri) {
        setEvidenceUris((current) => [...current, picture.uri]);
      }

      const nextStepIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextStepIndex);

      if (nextStepIndex >= challengeSteps.length) {
        setMessage('All prompts captured. Review and finish the local check.');
      } else {
        setMessage(`Captured. Next prompt: ${challengeSteps[nextStepIndex].title}.`);
      }
    } catch {
      setCountdown(null);
      setMessage('Capture failed. Keep the camera open and try again.');
    } finally {
      setCaptureBusy(false);
      setCountdown(null);
    }
  }

  async function finishWithDeviceUnlock() {
    setBiometricBusy(true);
    setMessage('');

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Finish local verification',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
        disableDeviceFallback: false,
      });

      if (result.success) {
        completeSuccess('challenge+biometric');
      } else {
        setMessage(
          result.error === 'user_cancel'
            ? 'Device unlock cancelled. You can still finish with the local check only.'
            : 'Device unlock failed. You can retry or finish with the local check only.',
        );
      }
    } catch {
      setMessage('Device unlock is unavailable right now. You can finish with the local check only.');
    } finally {
      setBiometricBusy(false);
    }
  }

  function finishLocalOnly() {
    completeSuccess('local_challenge');
  }

  function completeSuccess(method: string) {
    setPendingMethod(method);
    setSuccess(true);
    startProgressAnimation();
    void clearEvidence(evidenceUrisRef.current);
    setEvidenceUris([]);
    setTimeout(() => {
      onVerified(method);
    }, 2200);
  }

  function resetChallenge(reason: string) {
    setCaptureBusy(false);
    setBiometricBusy(false);
    setCountdown(null);
    setChallengeSteps(createChallengeSequence());
    setCurrentStepIndex(0);
    setSessionSecondsLeft(SESSION_DURATION_SECONDS);
    setMessage(reason);
    void clearEvidence(evidenceUrisRef.current);
    setEvidenceUris([]);
  }

  function startProgressAnimation() {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: false,
    }).start();
  }
}

function SuccessScreen({
  progressAnim,
  onContinue,
}: {
  progressAnim: Animated.Value;
  onContinue: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const isShortPhone = height < 700;

  return (
    <View style={styles.successBg}>
      <View style={[styles.successCard, { maxWidth: Math.min(width - 48, 360) }]}>
        <View style={styles.successIconWrap}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark" size={32} color="#FFFFFF" />
          </View>
        </View>

        <Text style={[styles.successTitle, isShortPhone && styles.successTitleCompact]}>
          Local Check{'\n'}Complete
        </Text>
        <Text style={styles.successBody}>Preparing your dashboard and clearing this session’s temporary captures…</Text>

        <View style={styles.successProgressTrack}>
          <Animated.View
            style={[
              styles.successProgressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onContinue}
          style={({ pressed }) => [styles.successButton, pressed && styles.pressed]}
        >
          <Text style={styles.successButtonText}>Go to Dashboard</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

function createChallengeSequence() {
  const shuffled = [...CHALLENGE_POOL];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, CHALLENGE_COUNT);
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function clearEvidence(uris: string[]) {
  await Promise.all(
    uris.map(async (uri) => {
      try {
        await FileSystem.deleteAsync(uri);
      } catch {
        return null;
      }

      return null;
    }),
  );
}

const COLOR = {
  primary: '#1650C0',
  primaryDark: '#0E3A8C',
  background: '#F4F7FC',
  text: '#0C2152',
  textSoft: '#5A6B80',
};

const styles = StyleSheet.create({
  loadingScreen: {
    backgroundColor: COLOR.background,
    flex: 1,
  },
  screen: {
    alignItems: 'center',
    backgroundColor: COLOR.background,
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  topIcon: {
    alignItems: 'center',
    backgroundColor: '#DDE7FF',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    marginBottom: 20,
    width: 52,
  },
  title: {
    color: COLOR.text,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 24,
  },
  subtitle: {
    color: '#4E5D72',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitleCompact: {
    fontSize: 14,
  },
  permissionCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingVertical: 26,
    shadowColor: '#B8C6DD',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    width: '100%',
  },
  permissionIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 20,
    height: 54,
    justifyContent: 'center',
    marginBottom: 18,
    width: 54,
  },
  permissionTitle: {
    color: COLOR.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  permissionBody: {
    color: COLOR.textSoft,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    marginTop: 10,
    textAlign: 'center',
  },
  sessionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    width: '100%',
  },
  sessionBadge: {
    alignItems: 'center',
    backgroundColor: '#E8F0FF',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sessionBadgeText: {
    color: COLOR.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  sessionCaption: {
    color: '#7A859A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cameraFrame: {
    alignItems: 'center',
    backgroundColor: '#1650C0',
    justifyContent: 'center',
    marginBottom: 18,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#1650C0',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
  },
  cameraPreview: {
    overflow: 'hidden',
  },
  cameraOverlayRing: {
    borderColor: 'rgba(255,255,255,0.55)',
    borderWidth: 4,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cameraOverlayCrosshair: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderRadius: 999,
    height: 10,
    position: 'absolute',
    width: 10,
  },
  cameraLoading: {
    alignItems: 'center',
    backgroundColor: 'rgba(9,23,54,0.44)',
    borderRadius: 18,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'absolute',
  },
  cameraLoadingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  countdownBubble: {
    alignItems: 'center',
    backgroundColor: 'rgba(9,23,54,0.76)',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    position: 'absolute',
    width: 64,
  },
  countdownText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  challengeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginBottom: 16,
    minHeight: 180,
    paddingHorizontal: 20,
    paddingVertical: 20,
    shadowColor: '#C7D4E6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    width: '100%',
  },
  challengeCardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  challengeLabel: {
    color: '#7A859A',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  challengeTitle: {
    color: COLOR.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  challengeIconWrap: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  challengeHintText: {
    color: '#5A6B80',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  challengeDotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 'auto',
  },
  challengeDot: {
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    flex: 1,
    height: 6,
  },
  challengeDotDone: {
    backgroundColor: '#1D8B63',
  },
  challengeDotActive: {
    backgroundColor: COLOR.primary,
  },
  statusTextWrap: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    marginBottom: 12,
    width: '100%',
  },
  statusText: {
    color: '#6B768A',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: COLOR.primary,
    borderRadius: 16,
    elevation: 6,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 58,
    paddingHorizontal: 24,
    shadowColor: '#0E3285',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    width: '100%',
  },
  primaryButtonDisabled: {
    backgroundColor: '#B8C5D8',
    elevation: 0,
    shadowOpacity: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  secondaryAction: {
    marginTop: 14,
    paddingVertical: 8,
  },
  secondaryActionText: {
    color: COLOR.primaryDark,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 18,
    paddingVertical: 8,
  },
  cancelText: {
    color: COLOR.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  devButton: {
    marginTop: 8,
    paddingVertical: 6,
  },
  devButtonText: {
    color: '#8899B5',
    fontSize: 12,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.84,
  },
  successBg: {
    alignItems: 'center',
    backgroundColor: '#EEF3FC',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    elevation: 10,
    paddingBottom: 32,
    paddingHorizontal: 28,
    paddingTop: 36,
    shadowColor: '#6A8AB8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    width: '100%',
  },
  successIconWrap: {
    alignItems: 'center',
    backgroundColor: '#E6EEFF',
    borderRadius: 50,
    height: 100,
    justifyContent: 'center',
    marginBottom: 28,
    width: 100,
  },
  successIconCircle: {
    alignItems: 'center',
    backgroundColor: '#0D2E60',
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  successTitle: {
    color: '#0C2152',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 38,
    marginBottom: 12,
    textAlign: 'center',
  },
  successTitleCompact: {
    fontSize: 26,
    lineHeight: 34,
  },
  successBody: {
    color: '#5A6B80',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  successProgressTrack: {
    backgroundColor: '#DDE6F5',
    borderRadius: 999,
    height: 8,
    marginBottom: 30,
    overflow: 'hidden',
    width: '100%',
  },
  successProgressFill: {
    backgroundColor: '#1650C0',
    borderRadius: 999,
    height: '100%',
  },
  successButton: {
    alignItems: 'center',
    backgroundColor: '#1650C0',
    borderRadius: 14,
    elevation: 5,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 24,
    shadowColor: '#0E3285',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    width: '100%',
  },
  successButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
