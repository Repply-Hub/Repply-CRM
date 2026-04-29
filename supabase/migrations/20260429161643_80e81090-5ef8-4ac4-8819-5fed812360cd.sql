-- Add address columns to clientes
ALTER TABLE public.clientes 
ADD COLUMN logradouro TEXT,
ADD COLUMN numero TEXT,
ADD COLUMN complemento TEXT,
ADD COLUMN bairro TEXT,
ADD COLUMN cidade TEXT,
ADD COLUMN uf TEXT,
ADD COLUMN cep TEXT;

-- Add address columns to contatos
ALTER TABLE public.contatos
ADD COLUMN logradouro TEXT,
ADD COLUMN numero TEXT,
ADD COLUMN complemento TEXT,
ADD COLUMN bairro TEXT,
ADD COLUMN cidade TEXT,
ADD COLUMN uf TEXT,
ADD COLUMN cep TEXT;
