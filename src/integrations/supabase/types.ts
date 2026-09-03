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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_erros: {
        Row: {
          component_stack: string | null
          criado_em: string
          empresa_id: string | null
          id: string
          mensagem: string
          rota: string | null
          stack: string | null
          user_agent: string | null
          user_id: string | null
          versao: string | null
        }
        Insert: {
          component_stack?: string | null
          criado_em?: string
          empresa_id?: string | null
          id?: string
          mensagem: string
          rota?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
          versao?: string | null
        }
        Update: {
          component_stack?: string | null
          criado_em?: string
          empresa_id?: string | null
          id?: string
          mensagem?: string
          rota?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
          versao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_erros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      assinatura_cancelamentos: {
        Row: {
          criado_em: string
          detalhe: string | null
          empresa_id: string
          id: string
          motivo: string | null
          usuario_id: string | null
        }
        Insert: {
          criado_em?: string
          detalhe?: string | null
          empresa_id: string
          id?: string
          motivo?: string | null
          usuario_id?: string | null
        }
        Update: {
          criado_em?: string
          detalhe?: string | null
          empresa_id?: string
          id?: string
          motivo?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinatura_cancelamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinatura_cancelamentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cargos_contato: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          is_sistema?: boolean
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          is_sistema?: boolean
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      chat_geral_config: {
        Row: {
          created_at: string
          empresa_id: string
          foto_url: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          foto_url?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          foto_url?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_geral_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
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
          foto_url: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          criado_por: string
          descricao?: string | null
          empresa_id: string
          foto_url?: string | null
          id?: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          criado_por?: string
          descricao?: string | null
          empresa_id?: string
          foto_url?: string | null
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
          lida: boolean
          lida_em: string | null
          quoted_arquivo_nome: string | null
          quoted_arquivo_tipo: string | null
          quoted_conteudo: string | null
          quoted_mensagem_id: string | null
          quoted_remetente_nome: string | null
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
          lida?: boolean
          lida_em?: string | null
          quoted_arquivo_nome?: string | null
          quoted_arquivo_tipo?: string | null
          quoted_conteudo?: string | null
          quoted_mensagem_id?: string | null
          quoted_remetente_nome?: string | null
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
          lida?: boolean
          lida_em?: string | null
          quoted_arquivo_nome?: string | null
          quoted_arquivo_tipo?: string | null
          quoted_conteudo?: string | null
          quoted_mensagem_id?: string | null
          quoted_remetente_nome?: string | null
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
            foreignKeyName: "chat_mensagens_quoted_mensagem_id_fkey"
            columns: ["quoted_mensagem_id"]
            isOneToOne: false
            referencedRelation: "chat_mensagens"
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
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      chat_mensagens_leituras: {
        Row: {
          id: string
          lida_em: string
          mensagem_id: string
          usuario_id: string
        }
        Insert: {
          id?: string
          lida_em?: string
          mensagem_id: string
          usuario_id: string
        }
        Update: {
          id?: string
          lida_em?: string
          mensagem_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensagens_leituras_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "chat_mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_leituras_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_leituras_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "chat_mensagens_leituras_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      clientes: {
        Row: {
          bairro: string | null
          campos_extras: Json
          cep: string | null
          cidade: string | null
          classificacao: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string
          criado_por_usuario_id: string | null
          data_criacao: string | null
          email: string | null
          empresa: string | null
          empresa_id: string | null
          endereco: string | null
          id: string
          logradouro: string | null
          nome_contato: string | null
          numero: string | null
          razao_social: string | null
          telefone: string | null
          tipo: string
          uf: string | null
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          bairro?: string | null
          campos_extras?: Json
          cep?: string | null
          cidade?: string | null
          classificacao?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          criado_por_usuario_id?: string | null
          data_criacao?: string | null
          email?: string | null
          empresa?: string | null
          empresa_id?: string | null
          endereco?: string | null
          id?: string
          logradouro?: string | null
          nome_contato?: string | null
          numero?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo: string
          uf?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          bairro?: string | null
          campos_extras?: Json
          cep?: string | null
          cidade?: string | null
          classificacao?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          criado_por_usuario_id?: string | null
          data_criacao?: string | null
          email?: string | null
          empresa?: string | null
          empresa_id?: string | null
          endereco?: string | null
          id?: string
          logradouro?: string | null
          nome_contato?: string | null
          numero?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo?: string
          uf?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_criado_por_usuario_id_fkey"
            columns: ["criado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
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
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      clientes_tipos: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string
          ordem: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          is_sistema?: boolean
          nome: string
          ordem?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          is_sistema?: boolean
          nome?: string
          ordem?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_tipos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
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
          empresa_id: string
          id: string
          updated_at: string
          updated_by: string | null
          valor: Json
        }
        Insert: {
          chave: string
          empresa_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor?: Json
        }
        Update: {
          chave?: string
          empresa_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_automacao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_campos: {
        Row: {
          campo_key: string
          created_at: string
          created_by: string | null
          empresa_id: string
          entidade: string
          etapa: string | null
          id: string
          label: string | null
          obrigatorio: boolean
          obrigatorio_escopo: string
          ordem: number
          origem: string
          tipo: string
          updated_at: string
        }
        Insert: {
          campo_key: string
          created_at?: string
          created_by?: string | null
          empresa_id: string
          entidade: string
          etapa?: string | null
          id?: string
          label?: string | null
          obrigatorio?: boolean
          obrigatorio_escopo?: string
          ordem?: number
          origem: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          campo_key?: string
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          entidade?: string
          etapa?: string | null
          id?: string
          label?: string | null
          obrigatorio?: boolean
          obrigatorio_escopo?: string
          ordem?: number
          origem?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_campos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_campos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "configuracoes_campos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "configuracoes_campos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_campos_etapas: {
        Row: {
          configuracao_campo_id: string
          created_at: string
          id: string
          kanban_coluna_id: string
        }
        Insert: {
          configuracao_campo_id: string
          created_at?: string
          id?: string
          kanban_coluna_id: string
        }
        Update: {
          configuracao_campo_id?: string
          created_at?: string
          id?: string
          kanban_coluna_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_campos_etapas_configuracao_campo_id_fkey"
            columns: ["configuracao_campo_id"]
            isOneToOne: false
            referencedRelation: "configuracoes_campos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_campos_etapas_kanban_coluna_id_fkey"
            columns: ["kanban_coluna_id"]
            isOneToOne: false
            referencedRelation: "kanban_colunas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_tabelas: {
        Row: {
          colunas: Json
          colunas_visiveis: Json
          created_at: string
          empresa_id: string
          id: string
          labels_personalizados: Json
          larguras_colunas: Json
          modelos: Json
          tabela_key: string
          tamanho_pagina: number
          updated_at: string
        }
        Insert: {
          colunas?: Json
          colunas_visiveis?: Json
          created_at?: string
          empresa_id: string
          id?: string
          labels_personalizados?: Json
          larguras_colunas?: Json
          modelos?: Json
          tabela_key: string
          tamanho_pagina?: number
          updated_at?: string
        }
        Update: {
          colunas?: Json
          colunas_visiveis?: Json
          created_at?: string
          empresa_id?: string
          id?: string
          labels_personalizados?: Json
          larguras_colunas?: Json
          modelos?: Json
          tabela_key?: string
          tamanho_pagina?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_tabelas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_wapi: {
        Row: {
          apelido: string | null
          cor: string | null
          api_instance_name: string | null
          api_key: string
          created_at: string
          empresa_id: string
          id: string
          instance_name: string
          instance_url: string
          provisionada: boolean
          status: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          apelido?: string | null
          cor?: string | null
          api_instance_name?: string | null
          api_key: string
          created_at?: string
          empresa_id: string
          id?: string
          instance_name?: string
          instance_url: string
          provisionada?: boolean
          status?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          apelido?: string | null
          cor?: string | null
          api_instance_name?: string | null
          api_key?: string
          created_at?: string
          empresa_id?: string
          id?: string
          instance_name?: string
          instance_url?: string
          provisionada?: boolean
          status?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_wapi_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          bairro: string | null
          campos_extras: Json
          cargo: string | null
          cep: string | null
          cidade: string | null
          classificacao: string | null
          cliente_id: string | null
          complemento: string | null
          created_at: string
          criado_por_usuario_id: string | null
          data_criacao: string | null
          email: string | null
          empresa: string | null
          empresa_id: string
          id: string
          logradouro: string | null
          nome_contato: string | null
          numero: string | null
          obra_id: string | null
          telefone: string | null
          uf: string | null
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          bairro?: string | null
          campos_extras?: Json
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          classificacao?: string | null
          cliente_id?: string | null
          complemento?: string | null
          created_at?: string
          criado_por_usuario_id?: string | null
          data_criacao?: string | null
          email?: string | null
          empresa?: string | null
          empresa_id?: string | null
          id?: string
          logradouro?: string | null
          nome_contato?: string | null
          numero?: string | null
          obra_id?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          bairro?: string | null
          campos_extras?: Json
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          classificacao?: string | null
          cliente_id?: string | null
          complemento?: string | null
          created_at?: string
          criado_por_usuario_id?: string | null
          data_criacao?: string | null
          email?: string | null
          empresa?: string | null
          empresa_id?: string | null
          id?: string
          logradouro?: string | null
          nome_contato?: string | null
          numero?: string | null
          obra_id?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_criado_por_usuario_id_fkey"
            columns: ["criado_por_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
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
      emails_recebidos: {
        Row: {
          assunto: string | null
          corpo_html: string | null
          criado_em: string | null
          data_recebimento: string | null
          destinatarios: string[] | null
          excluido: boolean | null
          gmail_message_id: string | null
          id: string
          lido: boolean | null
          remetente: string
          resend_id: string | null
          user_id: string | null
        }
        Insert: {
          assunto?: string | null
          corpo_html?: string | null
          criado_em?: string | null
          data_recebimento?: string | null
          destinatarios?: string[] | null
          excluido?: boolean | null
          gmail_message_id?: string | null
          id?: string
          lido?: boolean | null
          remetente: string
          resend_id?: string | null
          user_id?: string | null
        }
        Update: {
          assunto?: string | null
          corpo_html?: string | null
          criado_em?: string | null
          data_recebimento?: string | null
          destinatarios?: string[] | null
          excluido?: boolean | null
          gmail_message_id?: string | null
          id?: string
          lido?: boolean | null
          remetente?: string
          resend_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      email_conexao_estados: {
        Row: {
          criado_em: string
          empresa_id: string
          expira_em: string
          provedor: string
          state: string
          usuario_id: string | null
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          expira_em?: string
          provedor: string
          state: string
          usuario_id?: string | null
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          expira_em?: string
          provedor?: string
          state?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_conexao_estados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      email_conta_grants: {
        Row: {
          atualizado_em: string
          conta_id: string
          criado_em: string
          grant_id: string
        }
        Insert: {
          atualizado_em?: string
          conta_id: string
          criado_em?: string
          grant_id: string
        }
        Update: {
          atualizado_em?: string
          conta_id?: string
          criado_em?: string
          grant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_conta_grants_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: true
            referencedRelation: "email_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      email_conta_usuarios: {
        Row: {
          conta_id: string
          criado_em: string
          criado_por: string | null
          id: string
          /** Marcador liberado. NULO = a caixa inteira. */
          pasta_id: string | null
          usuario_id: string
        }
        Insert: {
          conta_id: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          pasta_id?: string | null
          usuario_id: string
        }
        Update: {
          conta_id?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          pasta_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_conta_usuarios_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "email_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_conta_usuarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      email_contas: {
        Row: {
          conectado_em: string
          conectado_por: string | null
          criado_em: string
          email: string
          empresa_id: string
          id: string
          nome_exibicao: string | null
          pasta_inbox_id: string | null
          pasta_sent_id: string | null
          provedor: string
          status: string
          ultima_sync_em: string | null
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          conectado_em?: string
          conectado_por?: string | null
          criado_em?: string
          email: string
          empresa_id: string
          id?: string
          nome_exibicao?: string | null
          pasta_inbox_id?: string | null
          pasta_sent_id?: string | null
          provedor: string
          status?: string
          ultima_sync_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          conectado_em?: string
          conectado_por?: string | null
          criado_em?: string
          email?: string
          empresa_id?: string
          id?: string
          nome_exibicao?: string | null
          pasta_inbox_id?: string | null
          pasta_sent_id?: string | null
          provedor?: string
          status?: string
          ultima_sync_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_contas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      email_mensagens: {
        Row: {
          caixa_origem: string | null
          anexos: Json
          assunto: string | null
          bcc: Json
          cc: Json
          /**
           * NULO quando a caixa de origem foi desconectada preservando o
           * histórico (migration 20260804184305, `ON DELETE SET NULL`). São 142
           * das 548 linhas em produção — declarar como `string` fazia o
           * TypeScript garantir algo que o banco não garante.
           */
          conta_id: string | null
          corpo_html: string | null
          criado_em: string
          data_mensagem: string
          destinatarios: Json
          direcao: string
          empresa_id: string
          enviado_por: string | null
          envio_erro: string | null
          envio_status: string | null
          excluido: boolean
          favorito: boolean
          id: string
          lido: boolean
          nylas_message_id: string
          nylas_thread_id: string | null
          pastas: string[]
          remetente_email: string | null
          remetente_nome: string | null
          reply_to: Json
          snippet: string | null
          tem_anexo: boolean
          updated_at: string
        }
        Insert: {
          caixa_origem?: string | null
          anexos?: Json
          assunto?: string | null
          bcc?: Json
          cc?: Json
          conta_id: string
          corpo_html?: string | null
          criado_em?: string
          data_mensagem: string
          destinatarios?: Json
          direcao: string
          empresa_id: string
          enviado_por?: string | null
          envio_erro?: string | null
          envio_status?: string | null
          excluido?: boolean
          favorito?: boolean
          id?: string
          lido?: boolean
          nylas_message_id: string
          nylas_thread_id?: string | null
          pastas?: string[]
          remetente_email?: string | null
          remetente_nome?: string | null
          reply_to?: Json
          snippet?: string | null
          tem_anexo?: boolean
          updated_at?: string
        }
        Update: {
          caixa_origem?: string | null
          anexos?: Json
          assunto?: string | null
          bcc?: Json
          cc?: Json
          conta_id?: string
          corpo_html?: string | null
          criado_em?: string
          data_mensagem?: string
          destinatarios?: Json
          direcao?: string
          empresa_id?: string
          enviado_por?: string | null
          envio_erro?: string | null
          envio_status?: string | null
          excluido?: boolean
          favorito?: boolean
          id?: string
          lido?: boolean
          nylas_message_id?: string
          nylas_thread_id?: string | null
          pastas?: string[]
          remetente_email?: string | null
          remetente_nome?: string | null
          reply_to?: Json
          snippet?: string | null
          tem_anexo?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_mensagens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "email_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_mensagens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      email_pastas: {
        Row: {
          atributos: string[]
          atualizado_em: string
          conta_id: string
          empresa_id: string
          id: string
          nao_lidas: number | null
          nome: string
          /** Id da pasta no provedor. No Google, `Label_<números>`. */
          pasta_id: string
          total_mensagens: number | null
        }
        Insert: {
          atributos?: string[]
          atualizado_em?: string
          conta_id: string
          empresa_id: string
          id?: string
          nao_lidas?: number | null
          nome: string
          pasta_id: string
          total_mensagens?: number | null
        }
        Update: {
          atributos?: string[]
          atualizado_em?: string
          conta_id?: string
          empresa_id?: string
          id?: string
          nao_lidas?: number | null
          nome?: string
          pasta_id?: string
          total_mensagens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_pastas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "email_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_pastas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      email_rascunhos: {
        Row: {
          assunto: string | null
          atualizado_em: string
          corpo: string | null
          criado_em: string
          destinatario: string | null
          empresa_id: string
          id: string
          usuario_id: string
        }
        Insert: {
          assunto?: string | null
          atualizado_em?: string
          corpo?: string | null
          criado_em?: string
          destinatario?: string | null
          empresa_id: string
          id?: string
          usuario_id: string
        }
        Update: {
          assunto?: string | null
          atualizado_em?: string
          corpo?: string | null
          criado_em?: string
          destinatario?: string | null
          empresa_id?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_rascunhos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_rascunhos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_assinaturas: {
        Row: {
          ativado_em: string | null
          cancel_at_period_end: boolean
          current_period_end: string | null
          empresa_id: string
          origem: string
          plan_status: string
          plano_slug: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          ultimo_evento_em: string | null
          updated_at: string
        }
        Insert: {
          ativado_em?: string | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          empresa_id: string
          origem?: string
          plan_status?: string
          plano_slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          ultimo_evento_em?: string | null
          updated_at?: string
        }
        Update: {
          ativado_em?: string | null
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          empresa_id?: string
          origem?: string
          plan_status?: string
          plano_slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          ultimo_evento_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_assinaturas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_assinaturas_plano_slug_fkey"
            columns: ["plano_slug"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["slug"]
          },
        ]
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
          secao_preset_id: string | null
          subtitulo_header: string | null
          whatsapp_assinar_remetente: boolean
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
          secao_preset_id?: string | null
          subtitulo_header?: string | null
          whatsapp_assinar_remetente?: boolean
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
          secao_preset_id?: string | null
          subtitulo_header?: string | null
          whatsapp_assinar_remetente?: boolean
        }
        Relationships: []
      }
      eventos: {
        Row: {
          cor: string
          created_at: string
          criado_por: string
          descricao: string | null
          dia_inteiro: boolean
          fim: string
          grupo_id: string
          id: string
          inicio: string
          lembrete_enviado: boolean
          lembrete_minutos: number | null
          obra_id: string | null
          rota_id: string | null
          rota_titulo: string | null
          tipo_calendario: string
          titulo: string
          updated_at: string
          user_id: string
          visita_observacao: string | null
          visita_realizada: boolean
        }
        Insert: {
          cor?: string
          created_at?: string
          criado_por: string
          descricao?: string | null
          dia_inteiro?: boolean
          fim: string
          grupo_id?: string
          id?: string
          inicio: string
          lembrete_enviado?: boolean
          lembrete_minutos?: number | null
          obra_id?: string | null
          rota_id?: string | null
          rota_titulo?: string | null
          tipo_calendario?: string
          titulo: string
          updated_at?: string
          user_id: string
          visita_observacao?: string | null
          visita_realizada?: boolean
        }
        Update: {
          cor?: string
          created_at?: string
          criado_por?: string
          descricao?: string | null
          dia_inteiro?: boolean
          fim?: string
          grupo_id?: string
          id?: string
          inicio?: string
          lembrete_enviado?: boolean
          lembrete_minutos?: number | null
          obra_id?: string | null
          rota_id?: string | null
          rota_titulo?: string | null
          tipo_calendario?: string
          titulo?: string
          updated_at?: string
          user_id?: string
          visita_observacao?: string | null
          visita_realizada?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "eventos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      fabricante_contatos: {
        Row: {
          created_at: string
          email: string | null
          fabricante_id: string
          funcao_id: string | null
          id: string
          nome: string
          observacao: string | null
          principal: boolean
          telefone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          fabricante_id: string
          funcao_id?: string | null
          id?: string
          nome: string
          observacao?: string | null
          principal?: boolean
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          fabricante_id?: string
          funcao_id?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          principal?: boolean
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fabricante_funcoes: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          is_sistema?: boolean
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          is_sistema?: boolean
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      fabricantes: {
        Row: {
          ativo: boolean
          campos_extras: Json
          cnpj: string | null
          created_at: string
          empresa_id: string
          id: string
          nome: string | null
          nome_contato: string | null
          telefone: string | null
          ultima_atualizacao_preco: string | null
        }
        Insert: {
          ativo?: boolean
          campos_extras?: Json
          cnpj?: string | null
          created_at?: string
          // Preenchido por trigger com a empresa de quem insere; só o super-admin
          // precisaria passar explicitamente.
          empresa_id?: string
          id?: string
          nome?: string | null
          nome_contato?: string | null
          telefone?: string | null
          ultima_atualizacao_preco?: string | null
        }
        Update: {
          ativo?: boolean
          campos_extras?: Json
          cnpj?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string | null
          nome_contato?: string | null
          telefone?: string | null
          ultima_atualizacao_preco?: string | null
        }
        Relationships: []
      }
      funis: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          is_padrao: boolean
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          is_padrao?: boolean
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          is_padrao?: boolean
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      gmail_tokens: {
        Row: {
          access_token: string
          created_at: string
          email: string
          expires_at: number
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          email: string
          expires_at: number
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          email?: string
          expires_at?: number
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      historico_alteracoes: {
        Row: {
          acao: string
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          descricao: string | null
          empresa_id: string | null
          id: string
          origem: string
          registro_id: string | null
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          origem?: string
          registro_id?: string | null
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          origem?: string
          registro_id?: string | null
          tabela?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_alteracoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_alteracoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_alteracoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "historico_alteracoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["usuario_id"]
          },
        ]
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
          funil_id: string
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
          funil_id: string
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
          funil_id?: string
          id?: string
          is_sistema?: boolean
          nome?: string | null
          ordem?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_colunas_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
          },
        ]
      }
      licencas_extremoz: {
        Row: {
          bloco_texto: string | null
          bloco_texto_hash: string | null
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
          pdf_storage_path: string | null
          prioridade: string | null
          quadro_societario: string | null
          razao_social: string | null
          telefone: string | null
          tipo_licenca: string | null
        }
        Insert: {
          bloco_texto?: string | null
          bloco_texto_hash?: string | null
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
          pdf_storage_path?: string | null
          prioridade?: string | null
          quadro_societario?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_licenca?: string | null
        }
        Update: {
          bloco_texto?: string | null
          bloco_texto_hash?: string | null
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
          pdf_storage_path?: string | null
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
          coordenadas_utm: string | null
          cpf_cnpj_formatado: string | null
          created_at: string
          data_emissao: string | null
          data_formacao: string | null
          data_validade: string | null
          empreendimento: string | null
          endereco_empreendimento: string | null
          fato_gerador: string | null
          fonte: string | null
          id: string
          interessado: string | null
          municipio: string | null
          numero_licenca: string | null
          numero_processo: string | null
          pdf_link: string | null
          pdf_processado: boolean
          porte: string | null
          potencial_poluidor: string | null
          razao_social: string | null
          tipo_licenca: string | null
          updated_at: string | null
          url_licenca: string | null
        }
        Insert: {
          atividade?: string | null
          bloco_texto?: string | null
          cnpj?: string | null
          coordenadas_utm?: string | null
          cpf_cnpj_formatado?: string | null
          created_at?: string
          data_emissao?: string | null
          data_formacao?: string | null
          data_validade?: string | null
          empreendimento?: string | null
          endereco_empreendimento?: string | null
          fato_gerador?: string | null
          fonte?: string | null
          id?: string
          interessado?: string | null
          municipio?: string | null
          numero_licenca?: string | null
          numero_processo?: string | null
          pdf_link?: string | null
          pdf_processado?: boolean
          porte?: string | null
          potencial_poluidor?: string | null
          razao_social?: string | null
          tipo_licenca?: string | null
          updated_at?: string | null
          url_licenca?: string | null
        }
        Update: {
          atividade?: string | null
          bloco_texto?: string | null
          cnpj?: string | null
          coordenadas_utm?: string | null
          cpf_cnpj_formatado?: string | null
          created_at?: string
          data_emissao?: string | null
          data_formacao?: string | null
          data_validade?: string | null
          empreendimento?: string | null
          endereco_empreendimento?: string | null
          fato_gerador?: string | null
          fonte?: string | null
          id?: string
          interessado?: string | null
          municipio?: string | null
          numero_licenca?: string | null
          numero_processo?: string | null
          pdf_link?: string | null
          pdf_processado?: boolean
          porte?: string | null
          potencial_poluidor?: string | null
          razao_social?: string | null
          tipo_licenca?: string | null
          updated_at?: string | null
          url_licenca?: string | null
        }
        Relationships: []
      }
      licencas_natal: {
        Row: {
          bloco_texto: string | null
          bloco_texto_hash: string | null
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
          pdf_storage_path: string | null
          razao_social: string | null
          telefone: string | null
          tipo_licenca: string | null
        }
        Insert: {
          bloco_texto?: string | null
          bloco_texto_hash?: string | null
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
          pdf_storage_path?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_licenca?: string | null
        }
        Update: {
          bloco_texto?: string | null
          bloco_texto_hash?: string | null
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
          pdf_storage_path?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_licenca?: string | null
        }
        Relationships: []
      }
      linhas_ignoradas_importacao: {
        Row: {
          created_at: string
          dados_originais: Json
          id: string
          motivo_ignorado: string | null
          nome_arquivo: string | null
          tipo_importacao: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          dados_originais: Json
          id?: string
          motivo_ignorado?: string | null
          nome_arquivo?: string | null
          tipo_importacao: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          dados_originais?: Json
          id?: string
          motivo_ignorado?: string | null
          nome_arquivo?: string | null
          tipo_importacao?: string
          usuario_id?: string
        }
        Relationships: []
      }
      marcadores: {
        Row: {
          cor: string
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string
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
          nome: string
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
          nome?: string
          ordem?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marcadores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
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
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      metas_vendas: {
        Row: {
          ano: number
          created_at: string
          empresa_id: string
          fabricante_id: string
          id: string
          mes: number
          meta_valor: number
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          ano: number
          created_at?: string
          empresa_id: string
          fabricante_id: string
          id?: string
          mes: number
          meta_valor?: number
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          ano?: number
          created_at?: string
          empresa_id?: string
          fabricante_id?: string
          id?: string
          mes?: number
          meta_valor?: number
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_vendas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_vendas_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "fabricantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_vendas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      marcadores_obras: {
        Row: {
          cor: string
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string
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
          nome: string
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
          nome?: string
          ordem?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marcadores_obras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
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
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      notificacoes_leituras: {
        Row: {
          lida_em: string
          notificacao_id: string
          usuario_id: string
        }
        Insert: {
          lida_em?: string
          notificacao_id: string
          usuario_id: string
        }
        Update: {
          lida_em?: string
          notificacao_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_leituras_notificacao_id_fkey"
            columns: ["notificacao_id"]
            isOneToOne: false
            referencedRelation: "notificacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_leituras_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_leituras_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "notificacoes_leituras_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      obra_contatos: {
        Row: {
          contato_id: string
          created_at: string
          id: string
          obra_id: string
        }
        Insert: {
          contato_id: string
          created_at?: string
          id?: string
          obra_id: string
        }
        Update: {
          contato_id?: string
          created_at?: string
          id?: string
          obra_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_contatos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obra_contatos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
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
          marcador_id: string | null
          longitude: number | null
          nome_obra: string | null
          spe_cnpj: string | null
        }
        Insert: {
          campos_extras?: Json
          cliente_id: string
          created_at?: string
          endereco_entrega?: string | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          marcador_id?: string | null
          longitude?: number | null
          nome_obra?: string | null
          spe_cnpj?: string | null
        }
        Update: {
          campos_extras?: Json
          cliente_id?: string
          created_at?: string
          endereco_entrega?: string | null
          geocoded_at?: string | null
          id?: string
          latitude?: number | null
          marcador_id?: string | null
          longitude?: number | null
          nome_obra?: string | null
          spe_cnpj?: string | null
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
            foreignKeyName: "obras_marcador_id_fkey"
            columns: ["marcador_id"]
            isOneToOne: false
            referencedRelation: "marcadores_obras"
            referencedColumns: ["id"]
          },
        ]
      }
      origens_pedido: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string
          ordem: number
          updated_at: string
          valor: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          is_sistema?: boolean
          nome: string
          ordem?: number
          updated_at?: string
          valor: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          is_sistema?: boolean
          nome?: string
          ordem?: number
          updated_at?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "origens_pedido_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
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
          fechado_em: string | null
          funil_id: string
          id: string
          import_hash: string | null
          marcador_id: string | null
          nome: string | null
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
          fechado_em?: string | null
          funil_id: string
          id?: string
          import_hash?: string | null
          marcador_id?: string | null
          nome?: string | null
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
          fechado_em?: string | null
          funil_id?: string
          id?: string
          import_hash?: string | null
          marcador_id?: string | null
          nome?: string | null
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
            foreignKeyName: "pedidos_marcador_id_fkey"
            columns: ["marcador_id"]
            isOneToOne: false
            referencedRelation: "marcadores"
            referencedColumns: ["id"]
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
            foreignKeyName: "pedidos_funil_id_fkey"
            columns: ["funil_id"]
            isOneToOne: false
            referencedRelation: "funis"
            referencedColumns: ["id"]
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
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      pedido_responsaveis: {
        Row: {
          created_at: string
          created_by: string | null
          pedido_id: string
          principal: boolean
          usuario_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          pedido_id: string
          principal?: boolean
          usuario_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          pedido_id?: string
          principal?: boolean
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_responsaveis_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_responsaveis_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_responsaveis_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_comentarios: {
        Row: {
          created_at: string
          id: string
          pedido_id: string
          texto: string
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pedido_id: string
          texto: string
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pedido_id?: string
          texto?: string
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_comentarios_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_comentarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_historico_status: {
        Row: {
          campo: string | null
          created_at: string
          id: string
          pedido_id: string
          status_anterior: string | null
          status_novo: string | null
          tipo: string
          usuario_id: string | null
          valor_anterior_txt: string | null
          valor_novo_txt: string | null
        }
        Insert: {
          campo?: string | null
          created_at?: string
          id?: string
          pedido_id: string
          status_anterior?: string | null
          status_novo?: string | null
          tipo?: string
          usuario_id?: string | null
          valor_anterior_txt?: string | null
          valor_novo_txt?: string | null
        }
        Update: {
          campo?: string | null
          created_at?: string
          id?: string
          pedido_id?: string
          status_anterior?: string | null
          status_novo?: string | null
          tipo?: string
          usuario_id?: string | null
          valor_anterior_txt?: string | null
          valor_novo_txt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_historico_status_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_historico_status_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
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
      permissao_presets: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          empresa_id: string
          id: string
          nome: string
          origem: string
          permissoes: Json
          preset_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id: string
          id?: string
          nome: string
          origem: string
          permissoes?: Json
          preset_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          origem?: string
          permissoes?: Json
          preset_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissao_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissao_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "permissao_presets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "permissao_presets_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
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
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      plano_vendas_fabricante_ordem: {
        Row: {
          empresa_id: string
          fabricante_id: string
          ordem: number
        }
        Insert: {
          empresa_id: string
          fabricante_id: string
          ordem: number
        }
        Update: {
          empresa_id?: string
          fabricante_id?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "plano_vendas_fabricante_ordem_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_vendas_fabricante_ordem_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "fabricantes"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          beneficios: Json
          created_at: string
          descricao: string | null
          intervalo: string
          moeda: string
          nome: string
          ordem: number
          preco_centavos: number
          selo: string | null
          slug: string
          stripe_price_id: string | null
          visivel: boolean
        }
        Insert: {
          beneficios?: Json
          created_at?: string
          descricao?: string | null
          intervalo?: string
          moeda?: string
          nome: string
          ordem?: number
          preco_centavos: number
          selo?: string | null
          slug: string
          stripe_price_id?: string | null
          visivel?: boolean
        }
        Update: {
          beneficios?: Json
          created_at?: string
          descricao?: string | null
          intervalo?: string
          moeda?: string
          nome?: string
          ordem?: number
          preco_centavos?: number
          selo?: string | null
          slug?: string
          stripe_price_id?: string | null
          visivel?: boolean
        }
        Relationships: []
      }
      stripe_eventos: {
        Row: {
          empresa_id: string | null
          id: string
          processado_em: string
          tipo: string | null
        }
        Insert: {
          empresa_id?: string | null
          id: string
          processado_em?: string
          tipo?: string | null
        }
        Update: {
          empresa_id?: string | null
          id?: string
          processado_em?: string
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      secao_excecoes: {
        Row: {
          criada_em: string
          criada_por: string | null
          empresa_id: string
          habilitada: boolean
          secao: string
        }
        Insert: {
          criada_em?: string
          criada_por?: string | null
          empresa_id: string
          habilitada: boolean
          secao: string
        }
        Update: {
          criada_em?: string
          criada_por?: string | null
          empresa_id?: string
          habilitada?: boolean
          secao?: string
        }
        Relationships: [
          {
            foreignKeyName: "secao_excecoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      secao_preset_itens: {
        Row: {
          habilitada: boolean
          preset_id: string
          secao: string
        }
        Insert: {
          habilitada?: boolean
          preset_id: string
          secao: string
        }
        Update: {
          habilitada?: boolean
          preset_id?: string
          secao?: string
        }
        Relationships: [
          {
            foreignKeyName: "secao_preset_itens_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "secao_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      secao_presets: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          is_padrao: boolean
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          is_padrao?: boolean
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          is_padrao?: boolean
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      sidebar_empresa_padrao: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          items: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          items?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          items?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sidebar_empresa_padrao_historico: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          items: Json
          salvo_por: string | null
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          items: Json
          salvo_por?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          items?: Json
          salvo_por?: string | null
        }
        Relationships: []
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
      tarefas: {
        Row: {
          campos_extras: Json
          cliente_id: string | null
          conversa_id: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          marcadores: string | null
          observadores: string | null
          participantes: string | null
          pedido_id: string | null
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
          cliente_id?: string | null
          conversa_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          marcadores?: string | null
          observadores?: string | null
          participantes?: string | null
          pedido_id?: string | null
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
          cliente_id?: string | null
          conversa_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          marcadores?: string | null
          observadores?: string | null
          participantes?: string | null
          pedido_id?: string | null
          prazo_final?: string | null
          projeto?: string | null
          responsavel?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_inativos"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      tarefas_kanban_colunas: {
        Row: {
          cor: string
          created_at: string
          empresa_id: string
          id: string
          is_sistema: boolean
          nome: string
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
          nome: string
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
          nome?: string
          ordem?: number
          slug?: string
          updated_at?: string
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
          assinatura_imagem_mostrar_empresa: boolean
          assinatura_imagem_mostrar_nome: boolean
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
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
          assinatura_imagem_mostrar_empresa?: boolean
          assinatura_imagem_mostrar_nome?: boolean
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
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
          assinatura_imagem_mostrar_empresa?: boolean
          assinatura_imagem_mostrar_nome?: boolean
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
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
      wapi_instancia_usuarios: {
        Row: {
          instancia_id: string
          usuario_auth_id: string
        }
        Insert: {
          instancia_id: string
          usuario_auth_id: string
        }
        Update: {
          instancia_id?: string
          usuario_auth_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wapi_instancia_usuarios_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "configuracoes_wapi"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_debug: {
        Row: {
          created_at: string | null
          id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      whatsapp_contatos_fotos: {
        Row: {
          empresa_id: string
          foto_perfil_url: string | null
          id: string
          telefone: string
          updated_at: string
        }
        Insert: {
          empresa_id: string
          foto_perfil_url?: string | null
          id?: string
          telefone: string
          updated_at?: string
        }
        Update: {
          empresa_id?: string
          foto_perfil_url?: string | null
          id?: string
          telefone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contatos_fotos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_figurinhas: {
        Row: {
          criada_em: string
          empresa_id: string
          id: string
          instancia_id: string
          media_hash: string
          media_mime: string | null
          media_url: string
          origem: string
          removida_em: string | null
          ultima_vez_em: string
        }
        Insert: {
          criada_em?: string
          empresa_id: string
          id?: string
          instancia_id: string
          media_hash: string
          media_mime?: string | null
          media_url: string
          origem: string
          removida_em?: string | null
          ultima_vez_em?: string
        }
        Update: {
          criada_em?: string
          empresa_id?: string
          id?: string
          instancia_id?: string
          media_hash?: string
          media_mime?: string | null
          media_url?: string
          origem?: string
          removida_em?: string | null
          ultima_vez_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_figurinhas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_figurinhas_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "configuracoes_wapi"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversa_atribuicoes: {
        Row: {
          atribuido_em: string
          conversa_id: string
          empresa_id: string
          id: string
          usuario_id: string
        }
        Insert: {
          atribuido_em?: string
          conversa_id: string
          empresa_id: string
          id?: string
          usuario_id: string
        }
        Update: {
          atribuido_em?: string
          conversa_id?: string
          empresa_id?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversa_atribuicoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversa_atribuicoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversa_atribuicoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversa_responsaveis: {
        Row: {
          conversa_id: string
          created_at: string
          id: string
          usuario_id: string
        }
        Insert: {
          conversa_id: string
          created_at?: string
          id?: string
          usuario_id: string
        }
        Update: {
          conversa_id?: string
          created_at?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversa_responsaveis_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversa_responsaveis_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversa_responsaveis_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "whatsapp_conversa_responsaveis_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      whatsapp_conversa_visualizacoes: {
        Row: {
          conversa_id: string
          id: string
          quantidade: number
          usuario_id: string
          visualizado_em: string
        }
        Insert: {
          conversa_id: string
          id?: string
          quantidade?: number
          usuario_id: string
          visualizado_em?: string
        }
        Update: {
          conversa_id?: string
          id?: string
          quantidade?: number
          usuario_id?: string
          visualizado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversa_visualizacoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversa_visualizacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversa_visualizacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "whatsapp_conversa_visualizacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["usuario_id"]
          },
        ]
      }
      whatsapp_conversas: {
        Row: {
          arquivada: boolean
          cliente_id: string | null
          contato_id: string | null
          created_at: string
          empresa_id: string
          foto_perfil_expires_at: string | null
          foto_perfil_url: string | null
          id: string
          instancia_id: string | null
          is_group: boolean
          nao_lidas: number
          nao_lidas_forcada: boolean
          nome_contato: string | null
          nome_contato_editado_manualmente: boolean
          participantes: Json
          precisa_atribuicao: boolean
          telefone: string
          ultima_mensagem: string | null
          ultima_mensagem_at: string | null
          ultima_mensagem_direcao: string | null
          updated_at: string
        }
        Insert: {
          arquivada?: boolean
          cliente_id?: string | null
          contato_id?: string | null
          created_at?: string
          empresa_id: string
          foto_perfil_expires_at?: string | null
          foto_perfil_url?: string | null
          id?: string
          instancia_id?: string | null
          is_group?: boolean
          nao_lidas?: number
          nao_lidas_forcada?: boolean
          nome_contato?: string | null
          nome_contato_editado_manualmente?: boolean
          participantes?: Json
          precisa_atribuicao?: boolean
          telefone: string
          ultima_mensagem?: string | null
          ultima_mensagem_at?: string | null
          ultima_mensagem_direcao?: string | null
          updated_at?: string
        }
        Update: {
          arquivada?: boolean
          cliente_id?: string | null
          contato_id?: string | null
          created_at?: string
          empresa_id?: string
          foto_perfil_expires_at?: string | null
          foto_perfil_url?: string | null
          id?: string
          instancia_id?: string | null
          is_group?: boolean
          nao_lidas?: number
          nao_lidas_forcada?: boolean
          nome_contato?: string | null
          nome_contato_editado_manualmente?: boolean
          participantes?: Json
          precisa_atribuicao?: boolean
          telefone?: string
          ultima_mensagem?: string | null
          ultima_mensagem_at?: string | null
          ultima_mensagem_direcao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversas_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "configuracoes_wapi"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens: {
        Row: {
          apagada_para_todos: boolean
          contato_payload: Json | null
          conteudo: string
          conteudo_original: string | null
          conversa_id: string
          created_at: string
          direcao: string
          editada: boolean
          editada_at: string | null
          empresa_id: string
          fixada: boolean
          id: string
          is_nota_interna: boolean
          lida: boolean
          media_mime: string | null
          media_url: string | null
          quoted_conteudo: string | null
          quoted_remetente_nome: string | null
          quoted_tipo: string | null
          quoted_wamid: string | null
          reacoes: Json
          remetente_nome: string | null
          remetente_telefone: string | null
          status: string
          tipo: string
          usuario_id: string | null
          wamid: string | null
        }
        Insert: {
          apagada_para_todos?: boolean
          contato_payload?: Json | null
          conteudo: string
          conteudo_original?: string | null
          conversa_id: string
          created_at?: string
          direcao: string
          editada?: boolean
          editada_at?: string | null
          empresa_id: string
          fixada?: boolean
          id?: string
          is_nota_interna?: boolean
          lida?: boolean
          media_mime?: string | null
          media_url?: string | null
          quoted_conteudo?: string | null
          quoted_remetente_nome?: string | null
          quoted_tipo?: string | null
          quoted_wamid?: string | null
          reacoes?: Json
          remetente_nome?: string | null
          remetente_telefone?: string | null
          status?: string
          tipo?: string
          usuario_id?: string | null
          wamid?: string | null
        }
        Update: {
          apagada_para_todos?: boolean
          contato_payload?: Json | null
          conteudo?: string
          conteudo_original?: string | null
          conversa_id?: string
          created_at?: string
          direcao?: string
          editada?: boolean
          editada_at?: string | null
          empresa_id?: string
          fixada?: boolean
          id?: string
          is_nota_interna?: boolean
          lida?: boolean
          media_mime?: string | null
          media_url?: string | null
          quoted_conteudo?: string | null
          quoted_remetente_nome?: string | null
          quoted_tipo?: string | null
          quoted_wamid?: string | null
          reacoes?: Json
          remetente_nome?: string | null
          remetente_telefone?: string | null
          status?: string
          tipo?: string
          usuario_id?: string | null
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_usuario"
            referencedColumns: ["usuario_id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_indicadores_vendedor"
            referencedColumns: ["usuario_id"]
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
      vw_pedidos_inativos: {
        Row: {
          cliente_nome: string | null
          dias_parado: number | null
          pedido_id: string | null
          status: string | null
          ultima_atualizacao: string | null
          usuario_nome: string | null
        }
        Relationships: []
      }
      vw_velocidade_por_fabricante: {
        Row: {
          empresa_id: string | null
          fabricante_id: string | null
          fabricante_nome: string | null
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
      admin_criar_preset: {
        Args: { p_descricao?: string; p_nome: string }
        Returns: string
      }
      admin_definir_excecao_secao: {
        Args: { p_empresa_id: string; p_habilitada: boolean | null; p_secao: string }
        Returns: undefined
      }
      admin_definir_item_preset: {
        Args: { p_habilitada: boolean; p_preset_id: string; p_secao: string }
        Returns: undefined
      }
      admin_definir_preset_da_empresa: {
        Args: { p_empresa_id: string; p_preset_id: string }
        Returns: undefined
      }
      admin_definir_preset_padrao: {
        Args: { p_preset_id: string }
        Returns: undefined
      }
      admin_excluir_preset: {
        Args: { p_preset_id: string }
        Returns: undefined
      }
      admin_listar_presets: {
        Args: never
        Returns: {
          descricao: string
          empresas_por_omissao: number
          empresas_seguindo: number
          id: string
          is_padrao: boolean
          nome: string
          secoes_ligadas: number
        }[]
      }
      admin_renomear_preset: {
        Args: { p_descricao?: string; p_nome: string; p_preset_id: string }
        Returns: undefined
      }
      admin_secoes_por_empresa: {
        Args: never
        Returns: {
          empresa_id: string
          empresa_nome: string
          habilitada: boolean
          origem: string
          preset_id: string
          preset_nome: string
          secao: string
          usuarios: number
        }[]
      }
      can_access_wa_conversa: {
        Args: { _conversa_id: string }
        Returns: boolean
      }
      criar_funil: { Args: { p_nome: string }; Returns: string }
      dashboard_indicadores_vendedor: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_fabricante_ids?: string[]
        }
        Returns: {
          qtd_fechado: number
          total_pedidos: number
          usuario_id: string
          usuario_nome: string
        }[]
      }
      dashboard_negocios_risco: {
        Args: {
          p_dias_parado?: number
          p_fabricante_ids?: string[]
          p_funil_id?: string
          p_usuario_ids?: string[]
        }
        Returns: {
          qtd_parados: number
          qtd_sem_proxima_acao: number
          risco_por_fabricante: Json
          risco_por_vendedor: Json
          valor_parados: number
          valor_risco_total: number
          valor_sem_proxima_acao: number
        }[]
      }
      dashboard_stats: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_fabricante_ids?: string[]
          p_usuario_ids?: string[]
        }
        Returns: {
          pedidos_fechados: number
          rendimento_fabricante: Json
          rendimento_vendedor: Json
          segmentacao_alto: number
          segmentacao_baixo: number
          segmentacao_medio: number
          total_faturamento: number
          total_pedidos: number
        }[]
      }
      dashboard_whatsapp_stats: {
        Args: {
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          conversas_abertas: number
          conversas_fechadas: number
          tempo_resposta_atendente: Json
          conversas_atribuidas_atendente: Json
        }[]
      }
      delete_current_user: { Args: never; Returns: undefined }
      delete_obras_bulk: { Args: { obra_ids: string[] }; Returns: undefined }
      empresa_plano_ativo: { Args: never; Returns: boolean }
      empresa_tem_secao: { Args: { p_secao: string }; Returns: boolean }
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
      definir_responsavel_principal: {
        Args: { p_pedido_id: string; p_usuario_id: string }
        Returns: undefined
      }
      is_gestor: { Args: never; Returns: boolean }
      is_member_of_grupo: { Args: { _grupo_id: string }; Returns: boolean }
      minhas_secoes: {
        Args: never
        Returns: {
          habilitada: boolean
          secao: string
        }[]
      }
      montar_permissoes_preset_padrao: {
        Args: { p_preset_key: string }
        Returns: Json
      }
      normalize_whatsapp_phone: { Args: { raw: string }; Returns: string }
      pauta_do_dia: {
        Args: Record<PropertyKey, never>
        Returns: {
          tipo: string
          referencia_id: string
          selo: string
          titulo: string
          detalhe: string
          valor: number | null
          quando: string | null
          dias_parado: number | null
          ordem: number
        }[]
      }
      parse_endereco_livre: {
        Args: { p_endereco: string }
        Returns: {
          bairro: string
          cep: string
          cidade: string
          complemento: string
          logradouro: string
          numero: string
          uf: string
        }[]
      }
      plano_vendas_progresso: {
        Args: {
          p_ano: number
          p_fabricante_ids?: string[]
          p_mes: number
          p_somente_com_meta?: boolean
          p_usuario_ids?: string[]
        }
        Returns: {
          fabricante_id: string
          fabricante_nome: string
          meta_equipe_valor: number
          meta_individual_valor: number
          meta_valor: number
          vendido_valor: number
        }[]
      }
      plano_vendas_progresso_por_vendedor: {
        Args: {
          p_ano: number
          p_fabricante_ids?: string[]
          p_mes: number
          p_usuario_ids?: string[]
        }
        Returns: {
          fabricante_id: string
          fabricante_nome: string
          meta_valor: number
          usuario_id: string
          usuario_nome: string
          vendido_valor: number
        }[]
      }
      obra_fabricantes: {
        Args: { p_obra_id: string }
        Returns: {
          fabricante_id: string
          fabricante_nome: string
          ganho_qtd: number
          ganho_valor: number
          total_qtd: number
        }[]
      }
      obra_negocios: {
        Args: { p_limit?: number; p_obra_id: string; p_offset?: number }
        Returns: {
          cliente_nome: string
          data_pedido: string
          etapa_nome: string
          fabricante_nome: string
          id: string
          negocio_nome: string
          responsavel: string
          status: string
          total_count: number
          valor_total: number
        }[]
      }
      obra_vendas: {
        Args: { p_obra_id: string }
        Returns: {
          aberto_qtd: number
          aberto_valor: number
          ganho_qtd: number
          ganho_valor: number
          perdido_qtd: number
          perdido_valor: number
          total_qtd: number
        }[]
      }
      pedidos_stats: {
        Args: {
          p_date_field?: string
          p_date_from?: string
          p_date_to?: string
          p_fabricante_ids?: string[]
          p_funil_id?: string
          p_hide_importados?: boolean
          p_marcador_ids?: string[]
          p_only_attention?: boolean
          p_search?: string
          p_stages?: string[]
          p_usuario_ids?: string[]
        }
        Returns: {
          total_count: number
          total_valor: number
        }[]
      }
      restaurar_usuario_por_email: {
        Args: {
          p_email: string
          p_empresa_id: string
          p_nome: string
          p_role: string
        }
        Returns: Json
      }
      set_whatsapp_assinar_remetente_global: {
        Args: { p_valor: boolean }
        Returns: number
      }
      upsert_meta_venda: {
        Args: {
          p_ano: number
          p_empresa_id: string
          p_fabricante_id: string
          p_mes: number
          p_meta_valor: number
          p_usuario_id: string | null
        }
        Returns: undefined
      }
      pode_acessar_obra: { Args: { _obra_id: string }; Returns: boolean }
      usuario_in_my_empresa: { Args: { _usuario_id: string }; Returns: boolean }
      validar_codigo_empresa: { Args: { p_codigo: string }; Returns: Json }
      vendedor_in_my_empresa: {
        Args: { _usuario_id: string }
        Returns: boolean
      }
      /**
       * Busca por texto nas mensagens de WhatsApp.
       *
       * É RPC, e não consulta direta, porque sob RLS o `ilike` não pode ser
       * avaliado antes da policy (`texticlike` não é leakproof) e o índice
       * trigram nunca era usado — termo raro chegava a 12 s e morria no
       * `statement_timeout`. A função é SECURITY DEFINER e aplica as mesmas
       * duas cláusulas da policy explicitamente.
       */
      wa_buscar_mensagens: {
        Args: {
          p_termo: string
          p_de?: string
          p_ate?: string
          p_limite?: number
        }
        Returns: {
          id: string
          conversa_id: string
          conteudo: string
          created_at: string
          direcao: string
          conversa_nome_contato: string | null
          conversa_telefone: string | null
          conversa_foto_perfil_url: string | null
          conversa_is_group: boolean | null
        }[]
      }
      wa_iniciar_conversa: {
        Args: {
          p_cliente_id?: string
          p_nome_contato?: string
          p_telefone: string
        }
        Returns: {
          arquivada: boolean
          cliente_id: string | null
          contato_id: string | null
          created_at: string
          empresa_id: string
          foto_perfil_expires_at: string | null
          foto_perfil_url: string | null
          id: string
          instancia_id: string | null
          is_group: boolean
          nao_lidas: number
          nao_lidas_forcada: boolean
          nome_contato: string | null
          participantes: Json
          telefone: string
          ultima_mensagem: string | null
          ultima_mensagem_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_conversas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wa_registrar_visualizacao: {
        Args: {
          _conversa_id: string
        }
        Returns: {
          quantidade: number
          visualizado_em: string
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
