import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, GripVertical, Save, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  SurveyDefinition,
  SurveyQuestion,
  useCreateSurveyDefinition,
  useUpdateSurveyDefinition,
} from "@/hooks/useSurveys";

// Default ecosystem survey based on the provided PDF
const ECOSYSTEM_SURVEY_TEMPLATE: SurveyQuestion[] = [
  // Section 1: Founder Characterization
  { id: "q1", section: "Caracterização do Fundador", question: "Qual é o seu papel dentro do ecossistema?", type: "select", options: ["Fundador", "Co-fundador", "CEO", "CTO", "Colaborador", "Mentor", "Investidor", "Outro"], required: true },
  { id: "q2", section: "Caracterização do Fundador", question: "Género", type: "select", options: ["Masculino", "Feminino", "Outro", "Prefiro não dizer"], required: true },
  { id: "q3", section: "Caracterização do Fundador", question: "Idade", type: "select", options: ["<26", "26-35", "36-45", "46-55", "56-65", ">65"], required: true },
  { id: "q4", section: "Caracterização do Fundador", question: "Nacionalidade", type: "text", required: true },
  { id: "q5", section: "Caracterização do Fundador", question: "Educação/Escolaridade", type: "select", options: ["Ensino Secundário", "Licenciatura", "Mestrado", "Doutoramento", "Outro"], required: true },
  { id: "q6", section: "Caracterização do Fundador", question: "Está ligado ou já esteve ligado ao Politécnico de Leiria?", type: "select", options: ["Sim, como estudante", "Sim, como professor", "Sim, como investigador", "Não"], required: true },
  { id: "q7", section: "Caracterização do Fundador", question: "Pertence a algum dos grupos sub-representados no empreendedorismo?", type: "multiselect", options: ["Desempregados", "Migrantes", "Minorias", "Refugiados", "Pessoas com deficiência", "Jovens <26", "Idosos +65", "Mulheres", "Nenhum"], required: false },

  // Section 2: General Characterization - Auto-fillable
  { id: "q8", section: "Caracterização Geral", question: "Fase da Startup (Startup Stage)", type: "select", options: ["Ideação", "Validação", "Crescimento", "Expansão", "Maturidade"], required: true, autoFillKey: "stage" },
  { id: "q9", section: "Caracterização Geral", question: "Nome da empresa/projeto", type: "text", required: false, autoFillKey: "startup_name" },
  { id: "q10", section: "Caracterização Geral", question: "Serviço atual", type: "select", options: ["Incubação física", "Incubação virtual", "Startup Visa", "Cowork", "Aceleração", "Outro"], required: true },
  { id: "q11", section: "Caracterização Geral", question: "Ano de fundação", type: "number", required: true, autoFillKey: "founded_year" },
  { id: "q12", section: "Caracterização Geral", question: "Tipo de investimento", type: "multiselect", options: ["Bootstrapping", "FFF", "Business Angels", "Capital de Risco", "Crowdfunding", "Subsídios/Grants", "Outro"], required: true },
  { id: "q13", section: "Caracterização Geral", question: "Montante de investimento obtido até 2025 (€)", type: "number", required: false },
  { id: "q14", section: "Caracterização Geral", question: "Montante de financiamento obtido em 2025 (€)", type: "number", required: false },
  { id: "q15", section: "Caracterização Geral", question: "Projetos EU em que está envolvido", type: "number", required: false },
  { id: "q16", section: "Caracterização Geral", question: "Valor do orçamento aprovado nesses projetos (€)", type: "number", required: false },
  { id: "q17", section: "Caracterização Geral", question: "Número de colaboradores", type: "number", required: true },
  { id: "q18", section: "Caracterização Geral", question: "Número de colaboradores em Leiria", type: "number", required: true },
  { id: "q19", section: "Caracterização Geral", question: "Empregos criados em 2025", type: "number", required: false },
  { id: "q20", section: "Caracterização Geral", question: "Empregos criados em 2025 em Leiria", type: "number", required: false },
  { id: "q21", section: "Caracterização Geral", question: "Quantas patentes tem a empresa?", type: "number", required: false },
  { id: "q22", section: "Caracterização Geral", question: "Quantas patentes solicitou em 2025?", type: "number", required: false },

  // Section 3: Ecosystem Diagnosis
  { id: "q23", section: "Diagnóstico do Ecossistema", question: "Qual o setor que melhor descreve a sua proposta de valor principal?", type: "select", options: ["Tecnologia/Software", "Saúde/Biotech", "Fintech", "EdTech", "GreenTech", "Indústria 4.0", "Retalho/E-commerce", "Turismo", "Agrotech", "Outro"], required: true, autoFillKey: "sector" },
  { id: "q24", section: "Diagnóstico do Ecossistema", question: "Qual a afirmação que melhor reflete a sua geração de receita atual?", type: "select", options: ["Ainda sem receita", "Receita <10k€/ano", "Receita 10k-50k€/ano", "Receita 50k-200k€/ano", "Receita >200k€/ano"], required: true },
  { id: "q25", section: "Diagnóstico do Ecossistema", question: "Qual é o estado atual da sua tecnologia ou produto?", type: "select", options: ["Conceito/Ideia", "MVP", "Produto em beta", "Produto lançado", "Produto maduro"], required: true },
  { id: "q26", section: "Diagnóstico do Ecossistema", question: "Como está estruturada a sua gestão financeira atualmente?", type: "select", options: ["Sem estrutura formal", "Excel/Sheets básico", "Software de faturação", "ERP completo", "CFO/Financeiro dedicado"], required: true },
  { id: "q27", section: "Diagnóstico do Ecossistema", question: "Que software de faturação/ERP utiliza?", type: "text", required: false },
  { id: "q28", section: "Diagnóstico do Ecossistema", question: "Está a utilizar incentivos fiscais (SIFIDE, RFAI, StartUP Visa)?", type: "multiselect", options: ["SIFIDE", "RFAI", "StartUP Visa", "Benefícios I&D", "Nenhum", "Não sei"], required: false },
  { id: "q29", section: "Diagnóstico do Ecossistema", question: "Quais são os seus maiores desafios de gestão financeira?", type: "multiselect", options: ["Tesouraria/Cash flow", "Acesso a financiamento", "Gestão fiscal", "Contabilidade", "Pricing", "Outro"], required: false },
  { id: "q30", section: "Diagnóstico do Ecossistema", question: "Tem Seguro de Acidentes de Trabalho ativo para TODOS os membros?", type: "select", options: ["Sim", "Não", "Parcialmente"], required: true },
  { id: "q31", section: "Diagnóstico do Ecossistema", question: "Que apólices estratégicas possui?", type: "multiselect", options: ["Responsabilidade civil", "Cibersegurança", "D&O", "Propriedade intelectual", "Nenhuma"], required: false },
  { id: "q32", section: "Diagnóstico do Ecossistema", question: "Que ferramentas utiliza para CRM?", type: "text", required: false },
  { id: "q33", section: "Diagnóstico do Ecossistema", question: "Que tipos de apoio técnico/desenvolvimento seriam mais valiosos?", type: "multiselect", options: ["Desenvolvimento software", "UX/UI Design", "DevOps/Cloud", "Data Science/AI", "Hardware/IoT", "Outro"], required: false },
  { id: "q34", section: "Diagnóstico do Ecossistema", question: "O seu negócio envolve Indústria Física, Manufatura ou Agricultura?", type: "select", options: ["Sim", "Não"], required: true },
  { id: "q35", section: "Diagnóstico do Ecossistema", question: "Quais são os seus principais requisitos de conectividade/IoT?", type: "textarea", required: false },
  { id: "q36", section: "Diagnóstico do Ecossistema", question: "Necessita de integração com maquinaria antiga?", type: "select", options: ["Sim", "Não", "Não aplicável"], required: false },
  { id: "q37", section: "Diagnóstico do Ecossistema", question: "Quais os mercados que está a visar ativamente?", type: "multiselect", options: ["Portugal", "Espanha", "Europa", "EUA", "Latam", "África", "Ásia", "Global"], required: true },
  { id: "q38", section: "Diagnóstico do Ecossistema", question: "Qual é o seu principal desafio de marketing?", type: "select", options: ["Notoriedade de marca", "Geração de leads", "Conversão", "Retenção", "Budget limitado", "Falta de expertise"], required: true },

  // Section 4: Legal & IP
  { id: "q39", section: "Jurídico e IP", question: "Qual é a sua configuração legal atual?", type: "select", options: ["ENI", "Lda", "SA", "Cooperativa", "Associação", "Em formação"], required: true, autoFillKey: "legal_form" },
  { id: "q40", section: "Jurídico e IP", question: "Concluiu os passos de conformidade obrigatórios?", type: "multiselect", options: ["NIF", "Segurança Social", "Seguros obrigatórios", "RGPD", "Licenças específicas", "Todos completos"], required: true },
  { id: "q41", section: "Jurídico e IP", question: "Tem uma Marca Registada ou Patente?", type: "multiselect", options: ["Marca registada PT", "Marca registada EU", "Patente nacional", "Patente internacional", "Em processo", "Nenhuma"], required: true },
  { id: "q42", section: "Jurídico e IP", question: "Como avalia o seu conhecimento sobre estratégia de IP?", type: "rating", min: 1, max: 5, required: true },
  { id: "q43", section: "Jurídico e IP", question: "Que tipos de ativos de IP são relevantes para o seu negócio?", type: "multiselect", options: ["Patentes", "Marcas", "Direitos de autor", "Segredos comerciais", "Designs", "Software"], required: false },
  { id: "q44", section: "Jurídico e IP", question: "Que apoio seria mais útil em Assuntos Jurídicos e IP?", type: "multiselect", options: ["Consultoria jurídica", "Registo de marcas", "Patentes", "Contratos", "RGPD", "Internacionalização"], required: false },
  { id: "q45", section: "Jurídico e IP", question: "Nível de confiança na conformidade atual (Trabalho, Fiscal, SS)?", type: "rating", min: 1, max: 5, required: true },

  // Section 5: Human Capital
  { id: "q46", section: "Capital Humano", question: "A sua equipa trabalha remotamente ou num modelo híbrido?", type: "select", options: ["100% Presencial", "Híbrido", "100% Remoto"], required: true },
  { id: "q47", section: "Capital Humano", question: "Tem acordos escritos para reembolso de despesas remotas?", type: "select", options: ["Sim", "Não", "Em desenvolvimento"], required: false },
  { id: "q48", section: "Capital Humano", question: "Quais são os seus principais obstáculos no recrutamento?", type: "multiselect", options: ["Talento técnico", "Salários competitivos", "Localização", "Cultura fit", "Experiência", "Outro"], required: false },
  { id: "q49", section: "Capital Humano", question: "Funções mais críticas para contratar nos próximos 12 meses?", type: "multiselect", options: ["Desenvolvimento", "Vendas", "Marketing", "Operações", "Financeiro", "Gestão", "Outro"], required: false },
  { id: "q50", section: "Capital Humano", question: "Áreas que beneficiariam de formação ou mentoria?", type: "multiselect", options: ["Liderança", "Vendas", "Marketing digital", "Finanças", "Produto", "Tecnologia", "Pessoas/RH"], required: false },

  // Section 6: Startup Leiria Support
  { id: "q51", section: "Apoio Startup Leiria", question: "Que tipos de apoio criariam mais valor nos próximos 12 meses?", type: "multiselect", options: ["Mentoria individual", "Workshops", "Networking", "Financiamento", "Espaço físico", "Internacionalização", "Recrutamento", "Legal/Jurídico"], required: true },
  { id: "q52", section: "Apoio Startup Leiria", question: "De que forma prefere interagir com o apoio da Startup Leiria?", type: "multiselect", options: ["Presencial", "Online síncrono", "Online assíncrono", "Email", "Plataforma dedicada"], required: true },
  { id: "q53", section: "Apoio Startup Leiria", question: "Mais alguma coisa sobre os seus desafios ou prioridades atuais?", type: "textarea", required: false },

  // Section 7: Satisfaction
  { id: "q54", section: "Satisfação", question: "Classificação dos serviços prestados - Mentoria", type: "rating", min: 1, max: 5, required: false },
  { id: "q55", section: "Satisfação", question: "Classificação dos serviços prestados - Espaço", type: "rating", min: 1, max: 5, required: false },
  { id: "q56", section: "Satisfação", question: "Classificação dos serviços prestados - Comunicação", type: "rating", min: 1, max: 5, required: false },
  { id: "q57", section: "Satisfação", question: "Classificação dos serviços prestados - Financiamento", type: "rating", min: 1, max: 5, required: false },
  { id: "q58", section: "Satisfação", question: "Classificação da comunicação - Redes Sociais", type: "rating", min: 1, max: 5, required: false },
  { id: "q59", section: "Satisfação", question: "Classificação da comunicação - Newsletter", type: "rating", min: 1, max: 5, required: false },
  { id: "q60", section: "Satisfação", question: "Classificação da comunicação - Website", type: "rating", min: 1, max: 5, required: false },
  { id: "q61", section: "Satisfação", question: "Probabilidade de recomendar os serviços (NPS 0-10)", type: "rating", min: 0, max: 10, required: true },
  { id: "q62", section: "Satisfação", question: "Sugestões de melhoria", type: "textarea", required: false },
];

interface SurveyTemplateEditorProps {
  definitions: SurveyDefinition[];
}

export function SurveyTemplateEditor({ definitions }: SurveyTemplateEditorProps) {
  const { t } = useTranslation();
  const createDefinition = useCreateSurveyDefinition();
  const updateDefinition = useUpdateSurveyDefinition();

  const [selectedDef, setSelectedDef] = useState<SurveyDefinition | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingQuestions, setEditingQuestions] = useState<SurveyQuestion[]>([]);

  const handleCreateDefault = () => {
    createDefinition.mutate({
      name: "Inquérito Ecossistema Startup Leiria",
      description: "Inquérito de Avaliação do Ecossistema - baseado no modelo oficial",
      questions_json: ECOSYSTEM_SURVEY_TEMPLATE,
      auto_fill_mappings: {
        stage: "workspace.stage",
        startup_name: "startup.name",
        founded_year: "startup.founded_year",
        sector: "startup.sector",
        legal_form: "startup.legal_form",
      },
    });
  };

  const handleSelectDefinition = (def: SurveyDefinition) => {
    setSelectedDef(def);
    setEditingName(def.name);
    setEditingDescription(def.description || "");
    setEditingQuestions(def.questions_json || []);
  };

  const handleSave = () => {
    if (!selectedDef) return;

    updateDefinition.mutate({
      id: selectedDef.id,
      name: editingName,
      description: editingDescription,
      questions_json: editingQuestions,
    });
  };

  const sections = [...new Set(editingQuestions.map((q) => q.section))];

  return (
    <div className="space-y-4">
      {definitions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              {t("admin.surveys.noTemplates", "No survey templates yet")}
            </p>
            <Button onClick={handleCreateDefault} disabled={createDefinition.isPending} loading={createDefinition.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              {t("admin.surveys.createDefaultTemplate", "Create Ecosystem Survey Template")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {/* Template List */}
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <Label>{t("admin.surveys.templates", "Templates")}</Label>
              <Button size="sm" variant="outline" onClick={handleCreateDefault}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {definitions.map((def) => (
              <Card
                key={def.id}
                className={`cursor-pointer transition-colors ${
                  selectedDef?.id === def.id ? "border-primary" : ""
                }`}
                onClick={() => handleSelectDefinition(def)}
              >
                <CardContent className="p-3">
                  <p className="font-medium text-sm">{def.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(def.questions_json as SurveyQuestion[])?.length || 0} questions
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Editor */}
          <div className="col-span-2">
            {selectedDef ? (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="font-semibold"
                      />
                      <Textarea
                        value={editingDescription}
                        onChange={(e) => setEditingDescription(e.target.value)}
                        placeholder="Description..."
                        rows={2}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateDefinition.isPending} loading={updateDefinition.isPending}
                      className="ml-2"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {t("common.save", "Save")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="space-y-2">
                    {sections.map((section) => (
                      <AccordionItem key={section} value={section}>
                        <AccordionTrigger className="text-sm font-medium">
                          {section}
                          <Badge variant="secondary" className="ml-2">
                            {editingQuestions.filter((q) => q.section === section).length}
                          </Badge>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pl-2">
                            {editingQuestions
                              .filter((q) => q.section === section)
                              .map((q, idx) => (
                                <div
                                  key={q.id}
                                  className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm"
                                >
                                  <span className="text-muted-foreground w-8">{q.id}</span>
                                  <span className="flex-1">{q.question}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {q.type}
                                  </Badge>
                                  {q.autoFillKey && (
                                    <Badge className="text-xs bg-[hsl(var(--info))]/20 text-[hsl(var(--info))]">
                                      Auto
                                    </Badge>
                                  )}
                                  {q.required && (
                                    <span className="text-destructive">*</span>
                                  )}
                                </div>
                              ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  {t("admin.surveys.selectTemplate", "Select a template to edit")}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
