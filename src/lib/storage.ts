import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { FinanceData } from '../types';

const DATA_KEY = 'finance-tracker:data:v1';
const SECURITY_KEY = 'finance-tracker:security:v1';

export async function loadFinanceData() {
  const stored = await AsyncStorage.getItem(DATA_KEY);
  if (!stored) {
    return null;
  }
  return JSON.parse(stored) as FinanceData;
}

export async function saveFinanceData(data: FinanceData) {
  await AsyncStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export async function saveSecurityState(value: { lastUnlockedAt: string; method: string }) {
  await SecureStore.setItemAsync(SECURITY_KEY, JSON.stringify(value));
}

export async function loadSecurityState() {
  const stored = await SecureStore.getItemAsync(SECURITY_KEY);
  return stored ? (JSON.parse(stored) as { lastUnlockedAt: string; method: string }) : null;
}
