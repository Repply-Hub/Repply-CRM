export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_permissoes: {
        Row: {
          acao: string
          admin_id: string
          created_at: string
          detalhes: Json | null
          id: string
          usuario_id: string
        }
        Insert: {
          acao: string
          admin_id: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          usuario_id: string
        }
        Update: {
          acao?: string
          admin_id?: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_permissoes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_permissoes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "audit_permissoes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "audit_permissoes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          cliente_id: string | null
          created_at: string
          detalhes: Json | null
          id: string
          pedido_id: string | null
          status: string | null
          tipo: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          detalhes?: Json | null
          id?: string
          pedido_id?: string | null
          status?: string | null
          tipo: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          detalhes?: Json | null
          id?: string
          pedido_id?: string | null
          status?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "automation_logs_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      chat_grupo_membros: {
        Row: {
          created_at: string
          grupo_id: string
          id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          grupo_id: string
          id?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          grupo_id?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_grupo_membros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "chat_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_grupo_membros_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_grupo_membros_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "chat_grupo_membros_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "chat_grupo_membros_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      chat_grupos: {
        Row: {
          created_at: string
          criado_por: string
          descricao: string | null
          empresa_id: string
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          criado_por: string
          descricao?: string | null
          empresa_id: string
          id?: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          criado_por?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_grupos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_grupos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "chat_grupos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "chat_grupos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "chat_grupos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_mensagens: {
        Row: {
          arquivo_nome: string | null
          arquivo_tipo: string | null
          arquivo_url: string | null
          conteudo: string
          created_at: string
          empresa_id: string
          grupo_id: string | null
          id: string
          recipient_id: string | null
          usuario_id: string
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_tipo?: string | null
          arquivo_url?: string | null
          conteudo: string
          created_at?: string
          empresa_id: string
          grupo_id?: string | null
          id?: string
          recipient_id?: string | null
          usuario_id: string
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_tipo?: string | null
          arquivo_url?: string | null
          conteudo?: string
          created_at?: string
          empresa_id?: string
          grupo_id?: string | null
          id?: string
          recipient_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensagens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "chat_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "chat_mensagens_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "chat_mensagens_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "chat_mensagens_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "chat_mensagens_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "chat_mensagens_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      clientes: {
        Row: {
          campos_extras: Json
          classificacao: string | null
          cnpj: string | null
          created_at: string
          data_criacao: string | null
          email: string | null
          empresa: string | null
          endereco: string | null
          id: string
          nome_contato: string | null
          razao_social: string | null
          telefone: string | null
          tipo: string
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          campos_extras?: Json
          classificacao?: string | null
          cnpj?: string | null
          created_at?: string
          data_criacao?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          id?: string
          nome_contato?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo: string
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          campos_extras?: Json
          classificacao?: string | null
          cnpj?: string | null
          created_at?: string
          data_criacao?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          id?: string
          nome_contato?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo?: string
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "clientes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "clientes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      colunas_customizadas: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          nome: string | null
          ordem: number
          slug: string
          tabela: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          nome?: string | null
          ordem?: number
          slug: string
          tabela: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string | null
          ordem?: number
          slug?: string
          tabela?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colunas_customizadas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_automacao: {
        Row: {
          chave: string
          id: string
          updated_at: string
          updated_by: string | null
          valor: Json
        }
        Insert: {
          chave: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor?: Json
        }
        Update: {
          chave?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor?: Json
        }
        Relationships: []
      }
      contatos: {
        Row: {
          campos_extras: Json
          cargo: string | null
          classificacao: string | null
          created_at: string
          data_criacao: string | null
          email: string | null
          empresa: string | null
          id: string
          nome_contato: string | null
          telefone: string | null
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          campos_extras?: Json
          cargo?: string | null
          classificacao?: string | null
          created_at?: string
          data_criacao?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          nome_contato?: string | null
          telefone?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          campos_extras?: Json
          cargo?: string | null
          classificacao?: string | null
          created_at?: string
          data_criacao?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          nome_contato?: string | null
          telefone?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      debug_logs: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
        }
        Relationships: []
      }
      emails: {
        Row: {
          assunto: string
          corpo: string | null
          created_at: string
          destinatario: string
          html: string | null
          id: string
          metadata: Json | null
          remetente: string
          resend_id: string | null
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assunto: string
          corpo?: string | null
          created_at?: string
          destinatario: string
          html?: string | null
          id?: string
          metadata?: Json | null
          remetente: string
          resend_id?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assunto?: string
          corpo?: string | null
          created_at?: string
          destinatario?: string
          html?: string | null
          id?: string
          metadata?: Json | null
          remetente?: string
          resend_id?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      empresas: {
        Row: {
          banner_url: string | null
          cnpj: string | null
          codigo_acesso: string
          cor_primaria: string | null
          created_at: string
          id: string
          logo_url: string | null
          nome: string | null
          nome_fantasia: string | null
          owner_id: string
          subtitulo_header: string | null
        }
        Insert: {
          banner_url?: string | null
          cnpj?: string | null
          codigo_acesso?: string
          cor_primaria?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          nome?: string | null
          nome_fantasia?: string | null
          owner_id: string
          subtitulo_header?: string | null
        }
        Update: {
          banner_url?: string | null
          cnpj?: string | null
          codigo_acesso?: string
          cor_primaria?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          nome?: string | null
          nome_fantasia?: string | null
          owner_id?: string
          subtitulo_header?: string | null
        }
        Relationships: []
      }
      eventos: {
        Row: {
          cor: string
          created_at: string
          descricao: string | null
          dia_inteiro: boolean
          fim: string
          id: string
          inicio: string
          tipo_calendario: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cor?: string
          created_at?: string
          descricao?: string | null
          dia_inteiro?: boolean
          fim: string
          id?: string
          inicio: string
          tipo_calendario?: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cor?: string
          created_at?: string
          descricao?: string | null
          dia_inteiro?: boolean
          fim?: string
          id?: string
          inicio?: string
          tipo_calendario?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fabricantes: {
        Row: {
          campos_extras: Json
          cnpj: string | null
          created_at: string
          id: string
          nome: string | null
          nome_contato: string | null
          telefone: string | null
          ultima_atualizacao_preco: string | null
        }
        Insert: {
          campos_extras?: Json
          cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          nome_contato?: string | null
          telefone?: string | null
          ultima_atualizacao_preco?: string | null
        }
        Update: {
          campos_extras?: Json
          cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          nome_contato?: string | null
          telefone?: string | null
          ultima_atualizacao_preco?: string | null
        }
        Relationships: []
      }
      historico_contatos: {
        Row: {
          data_contato: string
          descricao: string | null
          id: string
          pedido_id: string
          proximo_contato_em: string | null
          tipo: string
          usuario_id: string
        }
        Insert: {
          data_contato?: string
          descricao?: string | null
          id?: string
          pedido_id: string
          proximo_contato_em?: string | null
          tipo: string
          usuario_id: string
        }
        Update: {
          data_contato?: string
          descricao?: string | null
          id?: string
          pedido_id?: string
          proximo_contato_em?: string | null
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_contatos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_contatos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "historico_contatos_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_contatos_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "historico_contatos_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "historico_contatos_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      itens_pedido: {
        Row: {
          descricao_material: string
          id: string
          pedido_id: string
          preco_total: number | null
          preco_unitario: number
          quantidade: number
          referencia_fabricante: string | null
          unidade: string | null
        }
        Insert: {
          descricao_material: string
          id?: string
          pedido_id: string
          preco_total?: number | null
          preco_unitario: number
          quantidade: number
          referencia_fabricante?: string | null
          unidade?: string | null
        }
        Update: {
          descricao_material?: string
          id?: string
          pedido_id?: string
          preco_total?: number | null
          preco_unitario?: number
          quantidade?: number
          referencia_fabricante?: string | null
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      kanban_colunas: {
        Row: {
          cor: string
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string | null
          ordem: number
          slug: string
          updated_at: string
        }
        Insert: {
          cor?: string
          created_at?: string
          empresa_id: string
          id?: string
          is_sistema?: boolean
          nome?: string | null
          ordem?: number
          slug: string
          updated_at?: string
        }
        Update: {
          cor?: string
          created_at?: string
          empresa_id?: string
          id?: string
          is_sistema?: boolean
          nome?: string | null
          ordem?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      licencas_extremoz: {
        Row: {
          bloco_texto: string | null
          cnpj: string | null
          created_at: string
          data_edicao: string | null
          email: string | null
          endereco_empresa: string | null
          id: string
          nome_fantasia: string | null
          obra_descricao: string | null
          pdf_link: string | null
          pdf_nome: string | null
          prioridade: string | null
          quadro_societario: string | null
          razao_social: string | null
          telefone: string | null
          tipo_licenca: string | null
        }
        Insert: {
          bloco_texto?: string | null
          cnpj?: string | null
          created_at?: string
          data_edicao?: string | null
          email?: string | null
          endereco_empresa?: string | null
          id?: string
          nome_fantasia?: string | null
          obra_descricao?: string | null
          pdf_link?: string | null
          pdf_nome?: string | null
          prioridade?: string | null
          quadro_societario?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_licenca?: string | null
        }
        Update: {
          bloco_texto?: string | null
          cnpj?: string | null
          created_at?: string
          data_edicao?: string | null
          email?: string | null
          endereco_empresa?: string | null
          id?: string
          nome_fantasia?: string | null
          obra_descricao?: string | null
          pdf_link?: string | null
          pdf_nome?: string | null
          prioridade?: string | null
          quadro_societario?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_licenca?: string | null
        }
        Relationships: []
      }
      licencas_idema: {
        Row: {
          atividade: string | null
          bloco_texto: string | null
          cnpj: string | null
          created_at: string
          data_emissao: string | null
          data_validade: string | null
          empreendimento: string | null
          id: string
          municipio: string | null
          numero_licenca: string | null
          pdf_link: string | null
          porte: string | null
          potencial_poluidor: string | null
          razao_social: string | null
          tipo_licenca: string | null
        }
        Insert: {
          atividade?: string | null
          bloco_texto?: string | null
          cnpj?: string | null
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          empreendimento?: string | null
          id?: string
          municipio?: string | null
          numero_licenca?: string | null
          pdf_link?: string | null
          porte?: string | null
          potencial_poluidor?: string | null
          razao_social?: string | null
          tipo_licenca?: string | null
        }
        Update: {
          atividade?: string | null
          bloco_texto?: string | null
          cnpj?: string | null
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          empreendimento?: string | null
          id?: string
          municipio?: string | null
          numero_licenca?: string | null
          pdf_link?: string | null
          porte?: string | null
          potencial_poluidor?: string | null
          razao_social?: string | null
          tipo_licenca?: string | null
        }
        Relationships: []
      }
      licencas_natal: {
        Row: {
          bloco_texto: string | null
          cnpj: string | null
          construtora: string | null
          created_at: string
          data_edicao: string | null
          email: string | null
          endereco_obra: string | null
          fase_obra: string | null
          id: string
          nome_contato: string | null
          numero_dom: string | null
          obra_descricao: string | null
          pdf_link: string | null
          pdf_nome: string | null
          razao_social: string | null
          telefone: string | null
          tipo_licenca: string | null
        }
        Insert: {
          bloco_texto?: string | null
          cnpj?: string | null
          construtora?: string | null
          created_at?: string
          data_edicao?: string | null
          email?: string | null
          endereco_obra?: string | null
          fase_obra?: string | null
          id?: string
          nome_contato?: string | null
          numero_dom?: string | null
          obra_descricao?: string | null
          pdf_link?: string | null
          pdf_nome?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_licenca?: string | null
        }
        Update: {
          bloco_texto?: string | null
          cnpj?: string | null
          construtora?: string | null
          created_at?: string
          data_edicao?: string | null
          email?: string | null
          endereco_obra?: string | null
          fase_obra?: string | null
          id?: string
          nome_contato?: string | null
          numero_dom?: string | null
          obra_descricao?: string | null
          pdf_link?: string | null
          pdf_nome?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_licenca?: string | null
        }
        Relationships: []
      }
      mensagens_whatsapp: {
        Row: {
          cliente_id: string | null
          conteudo: string
          created_at: string
          id: string
          metodo: string
          pedido_id: string | null
          telefone_destino: string
          tipo_mensagem: string
          usuario_id: string
        }
        Insert: {
          cliente_id?: string | null
          conteudo: string
          created_at?: string
          id?: string
          metodo?: string
          pedido_id?: string | null
          telefone_destino: string
          tipo_mensagem?: string
          usuario_id: string
        }
        Update: {
          cliente_id?: string | null
          conteudo?: string
          created_at?: string
          id?: string
          metodo?: string
          pedido_id?: string | null
          telefone_destino?: string
          tipo_mensagem?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_whatsapp_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "mensagens_whatsapp_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          cliente_id: string | null
          created_at: string
          id: string
          lida: boolean
          mensagem: string | null
          pedido_id: string | null
          tipo: string
          titulo: string
          usuario_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          mensagem?: string | null
          pedido_id?: string | null
          tipo?: string
          titulo: string
          usuario_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          mensagem?: string | null
          pedido_id?: string | null
          tipo?: string
          titulo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "notificacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "notificacoes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "notificacoes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "notificacoes_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      obras: {
        Row: {
          campos_extras: Json
          cliente_id: string
          created_at: string
          endereco_entrega: string | null
          geocoded_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome_obra: string | null
          spe_cnpj: string | null
          status: string
        }
        Insert: {
          campos_extras?: Json
          cliente_id: string
          created_at?: string
          endereco_entrega?: string | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome_obra?: string | null
          spe_cnpj?: string | null
          status?: string
        }
        Update: {
          campos_extras?: Json
          cliente_id?: string
          created_at?: string
          endereco_entrega?: string | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome_obra?: string | null
          spe_cnpj?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "obras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      pedidos: {
        Row: {
          campos_extras: Json
          cliente_id: string
          created_at: string
          data_pedido: string
          endereco_entrega: string | null
          fabricante_id: string
          id: string
          obra_id: string | null
          observacoes: string | null
          origem_lead: string | null
          pdf_url: string | null
          prazo_resposta: string | null
          status: string
          updated_at: string
          usuario_id: string
          valor_total: number | null
        }
        Insert: {
          campos_extras?: Json
          cliente_id: string
          created_at?: string
          data_pedido?: string
          endereco_entrega?: string | null
          fabricante_id: string
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          origem_lead?: string | null
          pdf_url?: string | null
          prazo_resposta?: string | null
          status?: string
          updated_at?: string
          usuario_id: string
          valor_total?: number | null
        }
        Update: {
          campos_extras?: Json
          cliente_id?: string
          created_at?: string
          data_pedido?: string
          endereco_entrega?: string | null
          fabricante_id?: string
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          origem_lead?: string | null
          pdf_url?: string | null
          prazo_resposta?: string | null
          status?: string
          updated_at?: string
          usuario_id?: string
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "fabricantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "vw_velocidade_por_fabricante"
            referencedColumns: ["fabricante_id"]
          },
          {
            foreignKeyName: "pedidos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "pedidos_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "pedidos_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      perfis_customizados: {
        Row: {
          created_at: string
          id: string
          nome: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string | null
          slug?: string
        }
        Relationships: []
      }
      permissoes_usuario: {
        Row: {
          created_at: string
          funcionalidades: Json
          id: string
          modulo: string
          pode_criar: boolean
          pode_editar: boolean
          pode_excluir: boolean
          pode_ver: boolean
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          funcionalidades?: Json
          id?: string
          modulo: string
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_ver?: boolean
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          funcionalidades?: Json
          id?: string
          modulo?: string
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_ver?: boolean
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissoes_vendedor_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissoes_vendedor_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "permissoes_vendedor_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["vendedor_id"]
          },
          {
            foreignKeyName: "permissoes_vendedor_vendedor_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      sidebar_preferences: {
        Row: {
          created_at: string
          id: string
          items: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tabela_precos: {
        Row: {
          categoria: string | null
          created_at: string
          descricao_material: string
          fabricante_id: string
          id: string
          imagem_url: string | null
          preco_unitario: number
          referencia: string | null
          unidade: string | null
          vigente: boolean
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          descricao_material: string
          fabricante_id: string
          id?: string
          imagem_url?: string | null
          preco_unitario: number
          referencia?: string | null
          unidade?: string | null
          vigente?: boolean
        }
        Update: {
          categoria?: string | null
          created_at?: string
          descricao_material?: string
          fabricante_id?: string
          id?: string
          imagem_url?: string | null
          preco_unitario?: number
          referencia?: string | null
          unidade?: string | null
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tabela_precos_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "fabricantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabela_precos_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "vw_velocidade_por_fabricante"
            referencedColumns: ["fabricante_id"]
          },
        ]
      }
      tarefas: {
        Row: {
          campos_extras: Json
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          marcadores: string | null
          observadores: string | null
          participantes: string | null
          prazo_final: string | null
          projeto: string | null
          responsavel: string | null
          status: string
          titulo: string
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          campos_extras?: Json
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          marcadores?: string | null
          observadores?: string | null
          participantes?: string | null
          prazo_final?: string | null
          projeto?: string | null
          responsavel?: string | null
          status?: string
          titulo: string
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          campos_extras?: Json
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          marcadores?: string | null
          observadores?: string | null
          participantes?: string | null
          prazo_final?: string | null
          projeto?: string | null
          responsavel?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      user_domains: {
        Row: {
          created_at: string
          dns_records: Json | null
          domain_name: string
          id: string
          resend_domain_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dns_records?: Json | null
          domain_name: string
          id?: string
          resend_domain_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dns_records?: Json | null
          domain_name?: string
          id?: string
          resend_domain_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          created_at: string
          id: string
          resend_api_key: string | null
          resend_from_email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          resend_api_key?: string | null
          resend_from_email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          resend_api_key?: string | null
          resend_from_email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          assinatura_email: string | null
          avatar_url: string | null
          created_at: string
          email: string
          empresa_id: string | null
          id: string
          nome: string | null
          role: string
          telefone: string | null
          user_id: string | null
        }
        Insert: {
          assinatura_email?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          empresa_id?: string | null
          id?: string
          nome?: string | null
          role?: string
          telefone?: string | null
          user_id?: string | null
        }
        Update: {
          assinatura_email?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          empresa_id?: string | null
          id?: string
          nome?: string | null
          role?: string
          telefone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_faturamento_mensal: {
        Row: {
          empresa_id: string | null
          faturamento_total: number | null
          mes: string | null
          mes_ano: string | null
          qtd_pedidos_fechados: number | null
          ticket_medio: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_indicadores_usuario: {
        Row: {
          empresa_id: string | null
          qtd_elaborando: number | null
          qtd_enviado: number | null
          qtd_fechado: number | null
          qtd_negociacao: number | null
          qtd_novo_lead: number | null
          qtd_perdido: number | null
          taxa_fechamento: number | null
          tempo_medio_ate_orcamento_dias: number | null
          ticket_medio_fechado: number | null
          total_pedidos: number | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_indicadores_vendedor: {
        Row: {
          empresa_id: string | null
          qtd_elaborando: number | null
          qtd_enviado: number | null
          qtd_fechado: number | null
          qtd_negociacao: number | null
          qtd_novo_lead: number | null
          qtd_perdido: number | null
          taxa_fechamento: number | null
          tempo_medio_ate_orcamento_dias: number | null
          ticket_medio_fechado: number | null
          total_pedidos: number | null
          vendedor_id: string | null
          vendedor_nome: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_pedidos_inativos: {
        Row: {
          cliente_id: string | null
          cliente_nome: string | null
          dias_limite: string | null
          dias_parado: number | null
          pedido_id: string | null
          status: string | null
          ultima_atualizacao: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Relationships: []
      }
      vw_velocidade_por_fabricante: {
        Row: {
          empresa_id: string | null
          fabricante_id: string | null
          fabricante_nome: string | null
          tempo_medio_ate_orcamento_dias: number | null
          total_pedidos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      delete_current_user: { Args: never; Returns: undefined }
      get_my_empresa_id: { Args: never; Returns: string }
      get_my_usuario_id: { Args: never; Returns: string }
      get_my_vendedor_id: { Args: never; Returns: string }
      has_funcionalidade: {
        Args: { _funcionalidade: string; _modulo: string; _usuario_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _acao: string; _modulo: string; _usuario_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_gestor: { Args: never; Returns: boolean }
      usuario_in_my_empresa: { Args: { _usuario_id: string }; Returns: boolean }
      validar_codigo_empresa: { Args: { p_codigo: string }; Returns: Json }
      vendedor_in_my_empresa: {
        Args: { _usuario_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
