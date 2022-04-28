export type HistoryItemTemplate = {
  productCode: string;
  meta: {};
  tags: any[];
  contents: {
    label: string;
    values: {
      value: string;
      bold?: boolean;
    }[];
  }[];
  actions: {
    label: string;
    url: string;
    span: number;
  }[];
  product_code: string;
};

export type HistoryItem = {
  id: string;
  product: string;
  version: string;
  orderId: string;
  userId: number;
  reviewRequestId?: any;
  datetime: string;
  b2b: boolean;
  template: HistoryItemTemplate;
  deleteExceptionCode?: any;
};

export type HistoryResponse = {
  meta: {
    count: number;
    productCounts: {
      TAXI: number;
    };
    hasMore: boolean;
  };
  query: {
    userId: number;
    offset: number;
    limit: number;
    products: string[];
  };
  items: HistoryItem[];
};
