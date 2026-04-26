import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { FinanceData } from '../types';
import { toCsv } from './finance';

export async function exportTransactionsCsv(data: FinanceData) {
  const filename = `finance-export-${new Date().toISOString().slice(0, 10)}.csv`;
  const uri = `${FileSystem.documentDirectory ?? ''}${filename}`;
  await FileSystem.writeAsStringAsync(uri, toCsv(data), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Export finance data',
      UTI: 'public.comma-separated-values-text',
    });
  }

  return uri;
}
