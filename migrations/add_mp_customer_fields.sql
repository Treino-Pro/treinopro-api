-- Adicionar campos de customer do Mercado Pago na tabela saved_cards
ALTER TABLE saved_cards 
ADD COLUMN mp_customer_id VARCHAR(255),
ADD COLUMN mp_card_id VARCHAR(255);

-- Adicionar comentários para documentação
COMMENT ON COLUMN saved_cards.mp_customer_id IS 'ID do customer no Mercado Pago';
COMMENT ON COLUMN saved_cards.mp_card_id IS 'ID do cartão salvo no Mercado Pago';
