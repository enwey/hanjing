import { query, get } from './db.js';

const test = async () => {
  try {
    console.log('Testing global commissions query...');
    const list1 = await query(
      `SELECT do.*, d.nickname as promoter_name,
              MAX(o.order_no) as order_no,
              MAX(p.name) as patient_name,
              GROUP_CONCAT(DISTINCT pr.name SEPARATOR '、') as product_names
       FROM distribution_orders do
       JOIN distributors d ON do.distributor_id = d.id
       LEFT JOIN orders o ON do.order_id = o.id
       LEFT JOIN patients p ON o.user_id = p.user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products pr ON oi.product_id = pr.id
       GROUP BY do.id
       ORDER BY do.created_at DESC
       LIMIT 20`
    );
    console.log('Global commissions count:', list1.length);
    if (list1.length > 0) {
      console.log('First global commission row:', list1[0]);
    }

    console.log('\nTesting promoter-specific commissions query...');
    const list2 = await query(
      `SELECT do.*, o.order_no, p.name as patient_name,
              GROUP_CONCAT(DISTINCT pr.name SEPARATOR '、') as product_names
       FROM distribution_orders do
       LEFT JOIN orders o ON do.order_id = o.id
       LEFT JOIN patients p ON o.user_id = p.user_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products pr ON oi.product_id = pr.id
       WHERE do.distributor_id = ?
       GROUP BY do.id
       ORDER BY do.created_at DESC`,
      [4]
    );
    console.log('Promoter commissions count:', list2.length);
    if (list2.length > 0) {
      console.log('First promoter commission row:', list2[0]);
    }
  } catch (err) {
    console.error('SQL RUNTIME ERROR:', err);
  }
  process.exit(0);
};

test();
