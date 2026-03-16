/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TOUData {
  id: string;
  timestamp: number;
  customerName: string;
  customerNumber: string;
  peaMeterNumber: string;
  readingMonth: string;
  readingYear: string;
  readings: {
    [key: string]: {
      handwritten?: number;
      printed?: number;
      value?: number;
    };
  };
  analysis: {
    sumPeakMatch: boolean;
    diff015Match: boolean;
    diff016Match: boolean;
    diff017Match: boolean;
    diff118Match: boolean;
    details: string[];
  };
  imageUrl?: string;
}

export const TOU_CODES = [
  "111", "010", "020", "030", "015", "016", "017", "118", "050", "060", "070", "280"
];
