import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { request } from '../utils/mayar';
import { toOutput, validateRequiredString, validateEmail, validateMobile, validateOptionalISODate, validateInvoiceItems, validateNumberRange } from '../utils/validation';

/**
 * Node aksi Mayar: balance, invoice, coupon, customer.
 * Menerapkan validasi input, retry request, serta kontrol error.
 */
export class Mayar implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Mayar',
    name: 'mayar',
    icon: 'file:mayar.svg',
    group: ['transform'],
    version: 1,
    subtitle: 'Actions untuk Mayar',
    description: 'Aksi API Mayar: balance, invoice, coupon, customer',
    defaults: { name: 'Mayar' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'mayarApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        options: [
          { name: 'Balance', value: 'balance' },
          { name: 'Invoice', value: 'invoice' },
          { name: 'Coupon', value: 'coupon' },
          { name: 'Customer', value: 'customer' },
        ],
        default: 'invoice',
      },
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Pengaturan tambahan',
        default: {},
        options: [
          { displayName: 'Continue On Fail', name: 'continueOnFail', type: 'boolean', default: false },
          { displayName: 'Max Retries', name: 'maxRetries', type: 'number', default: 0, typeOptions: { minValue: 0, maxValue: 5 } },
          { displayName: 'Retry Delay (ms)', name: 'retryDelayMs', type: 'number', default: 500, typeOptions: { minValue: 0, maxValue: 30000 } },
          { displayName: 'Debug', name: 'debug', type: 'boolean', default: false },
        ],
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          { name: 'Get', value: 'get', action: 'Get Account Balance' },
        ],
        default: 'get',
        displayOptions: { show: { resource: ['balance'] } },
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          { name: 'Create', value: 'create', action: 'Create Invoice' },
          { name: 'Get', value: 'get', action: 'Get Invoice Detail' },
          { name: 'Get Many', value: 'getAll', action: 'Get Invoices' },
        ],
        default: 'create',
        displayOptions: { show: { resource: ['invoice'] } },
      },
      {
        displayName: 'Name', name: 'name', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['invoice'], operation: ['create'] } },
      },
      {
        displayName: 'Email', name: 'email', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['invoice'], operation: ['create'] } },
      },
      {
        displayName: 'Mobile', name: 'mobile', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['invoice'], operation: ['create'] } },
      },
      {
        displayName: 'Redirect URL', name: 'redirectUrl', type: 'string', default: 'https://web.mayar.id',
        displayOptions: { show: { resource: ['invoice'], operation: ['create'] } },
      },
      { displayName: 'Description', name: 'description', type: 'string', default: 'testing invoice', displayOptions: { show: { resource: ['invoice'], operation: ['create'] } } },
      { displayName: 'Expired At', name: 'expiredAt', type: 'string', default: '', placeholder: 'YYYY-MM-DDTHH:mm:ss.sssZ', displayOptions: { show: { resource: ['invoice'], operation: ['create'] } } },
      {
        displayName: 'Items', name: 'items', type: 'fixedCollection', typeOptions: { multipleValues: true }, default: {},
        options: [{ name: 'item', displayName: 'Item', values: [
          { displayName: 'Quantity', name: 'quantity', type: 'number', default: 1, required: true, typeOptions: { minValue: 1 } },
          { displayName: 'Rate', name: 'rate', type: 'number', default: 0, required: true, typeOptions: { minValue: 0.01 } },
          { displayName: 'Description', name: 'description', type: 'string', default: 'Item description' },
        ] }],
        displayOptions: { show: { resource: ['invoice'], operation: ['create'] } },
      },

      { displayName: 'Invoice ID', name: 'invoiceId', type: 'string', default: '', required: true, displayOptions: { show: { resource: ['invoice'], operation: ['get'] } } },

      {
        displayName: 'Operation', name: 'operation', type: 'options',
        options: [
          { name: 'Create', value: 'create', action: 'Create Coupon' },
          { name: 'Get', value: 'get', action: 'Get Coupon Detail' },
          { name: 'Get Many', value: 'getAll', action: 'Get Coupons' },
        ],
        default: 'create', displayOptions: { show: { resource: ['coupon'] } },
      },
      { displayName: 'Name', name: 'couponName', type: 'string', default: '', required: true, displayOptions: { show: { resource: ['coupon'], operation: ['create'] } } },
      { displayName: 'Expired At', name: 'couponExpiredAt', type: 'string', default: '', displayOptions: { show: { resource: ['coupon'], operation: ['create'] } } },
      {
        displayName: 'Discount', name: 'discount', type: 'fixedCollection', default: {}, options: [
          { name: 'value', displayName: 'Value', values: [
            { displayName: 'Discount Type', name: 'discountType', type: 'string', default: 'monetary' },
            { displayName: 'Eligible Customer Type', name: 'eligibleCustomerType', type: 'string', default: 'all' },
            { displayName: 'Minimum Purchase', name: 'minimumPurchase', type: 'number', default: 0 },
            { displayName: 'Value', name: 'value', type: 'number', default: 0 },
            { displayName: 'Total Coupons', name: 'totalCoupons', type: 'number', default: 1 },
          ] },
        ], displayOptions: { show: { resource: ['coupon'], operation: ['create'] } },
      },
      {
        displayName: 'Coupon', name: 'coupon', type: 'fixedCollection', default: {}, options: [
          { name: 'value', displayName: 'Value', values: [
            { displayName: 'Code', name: 'code', type: 'string', default: '' },
            { displayName: 'Type', name: 'type', type: 'string', default: 'reusable' },
          ] },
        ], displayOptions: { show: { resource: ['coupon'], operation: ['create'] } },
      },
      { displayName: 'Products (JSON)', name: 'products', type: 'json', default: '[]', displayOptions: { show: { resource: ['coupon'], operation: ['create'] } } },
      { displayName: 'Coupon ID', name: 'couponId', type: 'string', default: '', required: true, displayOptions: { show: { resource: ['coupon'], operation: ['get'] } } },

      {
        displayName: 'Operation', name: 'operation', type: 'options', options: [
          { name: 'Get Many', value: 'getAll', action: 'Get Customers' },
          { name: 'Create', value: 'create', action: 'Create Customer' },
          { name: 'Update Email', value: 'updateEmail', action: 'Update Customer Email' },
        ], default: 'getAll', displayOptions: { show: { resource: ['customer'] } },
      },
      { displayName: 'Page', name: 'page', type: 'number', default: 1, typeOptions: { minValue: 1 }, displayOptions: { show: { resource: ['customer'], operation: ['getAll'] } } },
      { displayName: 'Page Size', name: 'pageSize', type: 'number', default: 10, typeOptions: { minValue: 1, maxValue: 100 }, displayOptions: { show: { resource: ['customer'], operation: ['getAll'] } } },
      { displayName: 'Name', name: 'customerName', type: 'string', default: '', required: true, displayOptions: { show: { resource: ['customer'], operation: ['create'] } } },
      { displayName: 'Email', name: 'customerEmail', type: 'string', default: '', required: true, displayOptions: { show: { resource: ['customer'], operation: ['create'] } } },
      { displayName: 'Mobile', name: 'customerMobile', type: 'string', default: '', required: true, displayOptions: { show: { resource: ['customer'], operation: ['create'] } } },
      { displayName: 'From Email', name: 'fromEmail', type: 'string', default: '', required: true, displayOptions: { show: { resource: ['customer'], operation: ['updateEmail'] } } },
      { displayName: 'To Email', name: 'toEmail', type: 'string', default: '', required: true, displayOptions: { show: { resource: ['customer'], operation: ['updateEmail'] } } },
    ],
  };

  /**
   * Eksekusi utama node Mayar dengan validasi, retry, dan penanganan error.
   */
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;
    const opt = this.getNodeParameter('options', 0, {}) as { continueOnFail?: boolean; maxRetries?: number; retryDelayMs?: number; debug?: boolean };
    const retryCfg = { maxRetries: opt.maxRetries ?? 0, retryDelayMs: opt.retryDelayMs ?? 500 };
    const handle = async (fn: () => Promise<INodeExecutionData[][]>) => {
      try {
        return await fn();
      } catch (error: any) {
        if (opt.continueOnFail) return [toOutput({ error: error?.message ?? 'Request failed' })];
        if (error?.response || error?.statusCode || error?.status) {
          throw new NodeApiError(this.getNode(), error);
        }
        throw new NodeOperationError(this.getNode(), error?.message ?? 'Operation failed');
      }
    };

    if (resource === 'balance' && operation === 'get') {
      return handle(async () => {
        const response = await request(this, { method: 'GET', path: '/balance', retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'GET', path: '/balance' };
        return [toOutput(response)];
      });
    }

    if (resource === 'invoice' && operation === 'create') {
      const name = this.getNodeParameter('name', 0) as string;
      const email = this.getNodeParameter('email', 0) as string;
      const mobile = this.getNodeParameter('mobile', 0) as string;
      const redirectUrl = this.getNodeParameter('redirectUrl', 0) as string;
      const description = this.getNodeParameter('description', 0) as string;
      const expiredAt = this.getNodeParameter('expiredAt', 0) as string;
      const itemsParam = this.getNodeParameter('items', 0, {}) as { item?: Array<{ quantity: number; rate: number; description?: string }> };
      const items = (itemsParam.item ?? []).map((i) => ({ quantity: i.quantity, rate: i.rate, description: i.description }));

      return handle(async () => {
        validateRequiredString('Name', name);
        validateEmail('Email', email);
        validateMobile('Mobile', mobile);
        validateOptionalISODate('Expired At', expiredAt);
        validateInvoiceItems(items);
        const body = { name, email, mobile, redirectUrl, description, expiredAt, items };
        const response = await request(this, { method: 'POST', path: '/invoice/create', body, retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'POST', path: '/invoice/create', body };
        return [toOutput(response)];
      });
    }

    if (resource === 'invoice' && operation === 'getAll') {
      return handle(async () => {
        const response = await request(this, { method: 'GET', path: '/invoice', retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'GET', path: '/invoice' };
        return [toOutput(response)];
      });
    }

    if (resource === 'invoice' && operation === 'get') {
      const invoiceId = this.getNodeParameter('invoiceId', 0) as string;
      return handle(async () => {
        validateRequiredString('Invoice ID', invoiceId);
        const response = await request(this, { method: 'GET', path: `/invoice/${invoiceId}`, retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'GET', path: `/invoice/${invoiceId}` };
        return [toOutput(response)];
      });
    }

    if (resource === 'coupon' && operation === 'create') {
      const couponName = this.getNodeParameter('couponName', 0) as string;
      const couponExpiredAt = this.getNodeParameter('couponExpiredAt', 0) as string;
      const discountParam = this.getNodeParameter('discount', 0, {}) as { value?: { discountType?: string; eligibleCustomerType?: string; minimumPurchase?: number; value?: number; totalCoupons?: number } };
      const couponParam = this.getNodeParameter('coupon', 0, {}) as { value?: { code?: string; type?: string } };
      const productsJson = this.getNodeParameter('products', 0) as string;
      let products: unknown = [];
      try { products = productsJson ? JSON.parse(productsJson) : []; } catch (_) { throw new NodeOperationError(this.getNode(), 'Products harus berupa JSON valid'); }
      const body = {
        expiredAt: couponExpiredAt,
        name: couponName,
        discount: {
          discountType: discountParam.value?.discountType,
          eligibleCustomerType: discountParam.value?.eligibleCustomerType,
          minimumPurchase: discountParam.value?.minimumPurchase,
          value: discountParam.value?.value,
          totalCoupons: discountParam.value?.totalCoupons,
        },
        coupon: { code: couponParam.value?.code, type: couponParam.value?.type },
        products,
      };
      return handle(async () => {
        validateRequiredString('Name', couponName);
        validateOptionalISODate('Expired At', couponExpiredAt);
        if (discountParam.value?.value != null) validateNumberRange('Discount Value', discountParam.value.value, 0.01);
        if (discountParam.value?.totalCoupons != null) validateNumberRange('Total Coupons', discountParam.value.totalCoupons, 1);
        const response = await request(this, { method: 'POST', path: '/coupon/create', body, retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'POST', path: '/coupon/create', body };
        return [toOutput(response)];
      });
    }

    if (resource === 'coupon' && operation === 'get') {
      const couponId = this.getNodeParameter('couponId', 0) as string;
      return handle(async () => {
        validateRequiredString('Coupon ID', couponId);
        const response = await request(this, { method: 'GET', path: `/coupon/${couponId}`, retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'GET', path: `/coupon/${couponId}` };
        return [toOutput(response)];
      });
    }

    if (resource === 'coupon' && operation === 'getAll') {
      return handle(async () => {
        const response = await request(this, { method: 'GET', path: '/coupon', retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'GET', path: '/coupon' };
        return [toOutput(response)];
      });
    }

    if (resource === 'customer' && operation === 'getAll') {
      const page = this.getNodeParameter('page', 0) as number;
      const pageSize = this.getNodeParameter('pageSize', 0) as number;
      return handle(async () => {
        validateNumberRange('Page', page, 1);
        validateNumberRange('Page Size', pageSize, 1, 100);
        const response = await request(this, { method: 'GET', path: '/customer', qs: { page, pageSize }, retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'GET', path: '/customer', qs: { page, pageSize } };
        return [toOutput(response)];
      });
    }

    if (resource === 'customer' && operation === 'create') {
      const name = this.getNodeParameter('customerName', 0) as string;
      const email = this.getNodeParameter('customerEmail', 0) as string;
      const mobile = this.getNodeParameter('customerMobile', 0) as string;
      return handle(async () => {
        validateRequiredString('Name', name);
        validateEmail('Email', email);
        validateMobile('Mobile', mobile);
        const body = { name, email, mobile };
        const response = await request(this, { method: 'POST', path: '/customer/create', body, retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'POST', path: '/customer/create', body };
        return [toOutput(response)];
      });
    }

    if (resource === 'customer' && operation === 'updateEmail') {
      const fromEmail = this.getNodeParameter('fromEmail', 0) as string;
      const toEmail = this.getNodeParameter('toEmail', 0) as string;
      return handle(async () => {
        validateEmail('From Email', fromEmail);
        validateEmail('To Email', toEmail);
        if (fromEmail === toEmail) throw new Error('From Email dan To Email tidak boleh sama');
        const body = { fromEmail, toEmail };
        const response = await request(this, { method: 'POST', path: '/customer/update', body, retry: retryCfg });
        if (opt.debug) (response as any)._meta = { method: 'POST', path: '/customer/update', body };
        return [toOutput(response)];
      });
    }

    return [toOutput({ message: 'No operation executed' })];
  }
}