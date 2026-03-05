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
        ]
      }
      clientes: {
        Row: {
          cnpj: string | null
          created_at: string
          email: string | null
          empresa: string
          endereco: string | null
          id: string
          nome_contato: string | null
          telefone: string | null
          tipo: string
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          empresa: string
          endereco?: string | null
          id?: string
          nome_contato?: string | null
          telefone?: string | null
          tipo: string
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          empresa?: string
          endereco?: string | null
          id?: string
          nome_contato?: string | null
          telefone?: string | null
          tipo?: string
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fabricantes: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          nome: string
          nome_contato: string | null
          telefone: string | null
          ultima_atualizacao_preco: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome: string
          nome_contato?: string | null
          telefone?: string | null
          ultima_atualizacao_preco?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string
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
          vendedor_id: string
        }
        Insert: {
          data_contato?: string
          descricao?: string | null
          id?: string
          pedido_id: string
          proximo_contato_em?: string | null
          tipo: string
          vendedor_id: string
        }
        Update: {
          data_contato?: string
          descricao?: string | null
          id?: string
          pedido_id?: string
          proximo_contato_em?: string | null
          tipo?: string
          vendedor_id?: string
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
            foreignKeyName: "historico_contatos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
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
        ]
      }
      obras: {
        Row: {
          cliente_id: string
          created_at: string
          endereco_entrega: string | null
          id: string
          nome_obra: string
          spe_cnpj: string | null
          status: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          endereco_entrega?: string | null
          id?: string
          nome_obra: string
          spe_cnpj?: string | null
          status?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          endereco_entrega?: string | null
          id?: string
          nome_obra?: string
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
        ]
      }
      pedidos: {
        Row: {
          cliente_id: string
          created_at: string
          data_pedido: string
          fabricante_id: string
          id: string
          obra_id: string | null
          observacoes: string | null
          status: string
          updated_at: string
          valor_total: number | null
          vendedor_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_pedido?: string
          fabricante_id: string
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor_total?: number | null
          vendedor_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_pedido?: string
          fabricante_id?: string
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor_total?: number | null
          vendedor_id?: string
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
            foreignKeyName: "pedidos_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "fabricantes"
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
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      tabela_precos: {
        Row: {
          created_at: string
          descricao_material: string
          fabricante_id: string
          id: string
          preco_unitario: number
          referencia: string | null
          unidade: string | null
          vigente: boolean
        }
        Insert: {
          created_at?: string
          descricao_material: string
          fabricante_id: string
          id?: string
          preco_unitario: number
          referencia?: string | null
          unidade?: string | null
          vigente?: boolean
        }
        Update: {
          created_at?: string
          descricao_material?: string
          fabricante_id?: string
          id?: string
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
        ]
      }
      vendedores: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          role: string
          telefone: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          nome: string
          role?: string
          telefone?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          role?: string
          telefone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_vendedor_id: { Args: never; Returns: string }
      is_gestor: { Args: never; Returns: boolean }
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
