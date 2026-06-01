import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, Eye, EyeOff, Sparkles, Rocket, Users, Calendar } from 'lucide-react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { EnrollmentModeIndicator } from '@/components/auth/EnrollmentModeIndicator';
import startupLeiriaLogo from '@/assets/startup-leiria.svg';
import { logger } from '@/lib/logger';

export default function Login() {
  const { t } = useTranslation();
  
  const loginSchema = z.object({
    email: z.string().trim().email({ message: t('login.invalidEmail') }),
    password: z.string().min(6, { message: t('login.passwordMinLength') }),
  });

  const signupSchema = loginSchema.extend({
    fullName: z.string().trim().min(2, { message: t('login.nameMinLength') }).max(100),
  });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isLoading, signIn, signUp } = useAuth();
  
  // Handle returnTo param for invite flow
  const returnTo = searchParams.get('returnTo');
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  
  const [activeTab, setActiveTab] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'founder' | 'mentor_externo'>('founder');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  
  // Check if email is from startupleiria.com domain
  const isConsultorEmail = useMemo(() => {
    return email.toLowerCase().endsWith('@startupleiria.com');
  }, [email]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (user && !isLoading) {
      // If there's a returnTo param, redirect there instead of default
      if (returnTo) {
        navigate(decodeURIComponent(returnTo));
      } else {
        navigate('/my-workspaces');
      }
    }
  }, [user, isLoading, navigate, returnTo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      loginSchema.parse({ email, password });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
        return;
      }
    }

    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        setError(t('login.invalidCredentials'));
      } else {
        setError(error.message);
      }
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      signupSchema.parse({ email, password, fullName });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
        return;
      }
    }

    setIsSubmitting(true);

    // Prelaunch gate: check if email is allowed to sign up
    try {
      const { data: allowed, error: rpcError } = await supabase.rpc('check_signup_allowed', { p_email: email });
      if (rpcError) {
        logger.error('[Login] check_signup_allowed error', {}, rpcError);
        setError(t('login.signupCheckError', 'Unable to verify signup eligibility. Please try again.'));
        setIsSubmitting(false);
        return;
      }
      if (!allowed) {
        setError(t('login.inviteOnly', 'O registo está atualmente limitado a convites. Se acredita que deveria ter acesso, contacte a equipa Startup Leiria.'));
        setIsSubmitting(false);
        return;
      }
    } catch (err) {
      logger.error('[Login] Allowlist check failed', {}, err);
      setError(t('login.signupCheckError', 'Unable to verify signup eligibility. Please try again.'));
      setIsSubmitting(false);
      return;
    }

    // Only pass role if not a consultor email (consultor role is auto-assigned by the database)
    const roleToAssign = isConsultorEmail ? undefined : selectedRole;
    const { error } = await signUp(email, password, fullName, roleToAssign);
    setIsSubmitting(false);

    if (error) {
      if (error.message.includes('already registered')) {
        setError(t('login.emailAlreadyRegistered'));
      } else {
        setError(error.message);
      }
    } else {
      // Show confirmation message — user needs to verify email before proceeding
      setError(null);
      setSignupSuccess(true);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse" aria-live="polite">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen relative">
      {/* Language and Theme Selectors */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <LanguageSelector />
        <ThemeToggle />
      </div>
      {/* Left side - branding with logo */}
      <div className="hidden lg:flex lg:flex-1 bg-foreground relative overflow-hidden items-center justify-center p-12">
        {/* Animated decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-accent/30 blur-3xl animate-pulse-soft" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-primary/25 blur-3xl animate-pulse-soft" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-accent/20 blur-3xl animate-pulse-soft" style={{ animationDelay: '0.5s' }} />
          
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'linear-gradient(hsl(var(--background)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--background)) 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }} />
        </div>
        
        <div className={`relative z-10 max-w-lg text-center transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="mb-10 flex justify-center">
            <div className="relative group">
              <div className="absolute -inset-4 bg-accent/20 rounded-full blur-xl group-hover:bg-accent/30 transition-colors duration-500" />
              <img 
                src={startupLeiriaLogo} 
                alt="Startup Leiria" 
                width={480}
                height={96}
                fetchPriority="high"
                className="relative h-24 w-auto drop-shadow-2xl transition-transform duration-500 hover:scale-105"
              />
            </div>
          </div>
          <h1 className="font-heading text-4xl font-bold text-background mb-4 tracking-tight">
            {t('login.platformTitle')}
          </h1>
          <p className="text-lg text-background/70 mb-6 leading-relaxed">
            {t('login.platformSubtitle')}
          </p>

          {/* Book a Meeting CTA */}
          <div className="mb-10">
            <Link
              to="/book/demo"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-all duration-300 hover:shadow-lg hover:shadow-accent/25 hover:scale-105"
            >
              <Calendar className="h-5 w-5" />
              {t('publicBooking.bookFirstMeeting')}
            </Link>
            <p className="text-sm text-background/50 mt-2">
              {t('publicBooking.bookFirstMeetingDesc')}
            </p>
          </div>

          {/* Benefits Section - hidden on smaller screens within left panel */}
          <div className={`mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {[
              { 
                title: t('login.benefitMentorship'), 
                description: t('login.benefitMentorshipDesc'),
                icon: Users, 
                gradient: 'from-accent to-accent/60' 
              },
              { 
                title: t('login.benefitNetwork'), 
                description: t('login.benefitNetworkDesc'),
                icon: Rocket, 
                gradient: 'from-primary to-primary/60' 
              },
              { 
                title: t('login.benefitGrowth'), 
                description: t('login.benefitGrowthDesc'),
                icon: Sparkles, 
                gradient: 'from-accent to-primary' 
              },
            ].map((benefit, index) => (
              <div 
                key={benefit.title} 
                className="group relative text-center p-4 rounded-2xl bg-background/5 backdrop-blur-sm border border-background/10 hover:bg-background/10 hover:border-background/20 transition-all duration-500 cursor-default"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                {/* Glow effect on hover */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${benefit.gradient} opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500`} />
                
                {/* Icon */}
                <div className="relative mb-3 flex justify-center">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${benefit.gradient} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <benefit.icon className="h-5 w-5 text-background" />
                  </div>
                </div>
                
                {/* Title */}
                <div className="relative text-sm font-semibold text-background mb-1">
                  {benefit.title}
                </div>
                
                {/* Description */}
                <div className="relative text-xs text-background/60 group-hover:text-background/80 transition-colors leading-relaxed">
                  {benefit.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - auth forms */}
      <div className="flex flex-1 items-start lg:items-center justify-center p-8 pt-16 lg:pt-8 bg-background overflow-y-auto">
        <div className={`w-full max-w-md transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <img 
              src={startupLeiriaLogo} 
              alt="Startup Leiria" 
              width={320}
              height={64}
              fetchPriority="high"
              className="h-16 w-auto mx-auto mb-4"
            />
            <h1 className="font-heading text-2xl font-bold text-foreground">
              {t('login.platformTitle')}
            </h1>
          </div>

          <Card className="shadow-xl border-border/50 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
            <CardHeader className="space-y-1 pb-4 relative">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                <CardTitle className="font-heading text-2xl">{t('login.welcome')}</CardTitle>
              </div>
              <CardDescription>
                {t('login.signInDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              {/* Enrollment mode indicator */}
              <div className="mb-4">
                <EnrollmentModeIndicator />
              </div>

              <Tabs value={activeTab} onValueChange={(v) => {
                setActiveTab(v);
                setError(null);
                // Clear cross-tab field bleed: password is sensitive, fullName only relevant for signup
                setPassword('');
                setFullName('');
                setSignupSuccess(false);
              }}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login" className="data-[state=active]:shadow-sm">{t('auth.signIn')}</TabsTrigger>
                  <TabsTrigger value="signup" className="data-[state=active]:shadow-sm">{t('auth.signUp')}</TabsTrigger>
                </TabsList>

                {error && (
                  <Alert variant="destructive" className="mb-4 animate-fade-in">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <TabsContent value="login" className="animate-fade-in">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">{t('auth.email')}</Label>
                      <div className="relative group">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder={t('login.emailPlaceholder')}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10 transition-shadow focus:shadow-md"
                          required
                          aria-required="true"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">{t('auth.password')}</Label>
                      <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          placeholder={t('login.passwordPlaceholder')}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 pr-10 transition-shadow focus:shadow-md"
                          required
                          aria-required="true"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? t('accessibility.hidePassword') : t('accessibility.showPassword')}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Button
                        type="button"
                        variant="link"
                        className="px-0 text-sm text-muted-foreground hover:text-primary"
                        onClick={() => setForgotPasswordOpen(true)}
                      >
                        {t('auth.forgotPassword')}
                      </Button>
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full h-11 text-base font-medium transition-all duration-300 hover:shadow-lg hover:shadow-primary/25" 
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" aria-hidden="true" />
                          {t('login.signingIn')}
                        </span>
                      ) : t('auth.signIn')}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="animate-fade-in">
                  {signupSuccess ? (
                    <div className="text-center space-y-4 py-6">
                      <div className="flex justify-center">
                        <div className="p-3 rounded-full bg-primary/10">
                          <Mail className="h-8 w-8 text-primary" />
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold">{t('login.signupSuccessTitle', 'Conta criada com sucesso!')}</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                        {t('login.signupSuccessDesc', 'Enviámos um email de verificação para o seu endereço. Por favor verifique a sua caixa de correio e clique no link de confirmação.')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {email}
                      </p>
                      <Button variant="outline" onClick={() => { setSignupSuccess(false); setActiveTab('login'); }} className="mt-2">
                        {t('login.backToLogin', 'Voltar ao login')}
                      </Button>
                    </div>
                  ) : (
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">{t('login.fullName')}</Label>
                      <div className="relative group">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
                        <Input
                          id="signup-name"
                          type="text"
                          placeholder={t('login.fullNamePlaceholder')}
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="pl-10 transition-shadow focus:shadow-md"
                          required
                          aria-required="true"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">{t('auth.email')}</Label>
                      <div className="relative group">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder={t('login.emailPlaceholder')}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10 transition-shadow focus:shadow-md"
                          required
                          aria-required="true"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">{t('auth.password')}</Label>
                      <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          placeholder={t('login.passwordPlaceholder')}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 pr-10 transition-shadow focus:shadow-md"
                          required
                          aria-required="true"
                          minLength={6}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? t('accessibility.hidePassword') : t('accessibility.showPassword')}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('login.passwordHint')}
                      </p>
                    </div>
                    
                    {/* Role Selection */}
                    <div className="space-y-3">
                      <Label>{t('login.iAmA')}</Label>
                      {isConsultorEmail ? (
                        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                          <div className="flex items-center gap-2 text-sm font-medium text-primary">
                            <Users className="h-4 w-4" aria-hidden="true" />
                            <span>{t('login.consultorDetected')}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('login.consultorAutoAssign')}
                          </p>
                        </div>
                      ) : (
                        <RadioGroup 
                          value={selectedRole} 
                          onValueChange={(v) => setSelectedRole(v as 'founder' | 'mentor_externo')}
                          className="grid grid-cols-2 gap-3"
                          aria-label={t('login.iAmA')}
                        >
                          <Label
                            htmlFor="role-founder"
                            className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                              selectedRole === 'founder' 
                                ? 'border-primary bg-primary/5' 
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <RadioGroupItem value="founder" id="role-founder" className="sr-only" />
                            <Rocket className={`h-6 w-6 ${selectedRole === 'founder' ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                            <span className={`text-sm font-medium ${selectedRole === 'founder' ? 'text-primary' : 'text-foreground'}`}>
                              {t('login.founder')}
                            </span>
                            <span className="text-xs text-muted-foreground text-center">
                              {t('login.founderDesc')}
                            </span>
                          </Label>
                          <Label
                            htmlFor="role-mentor"
                            className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                              selectedRole === 'mentor_externo' 
                                ? 'border-primary bg-primary/5' 
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <RadioGroupItem value="mentor_externo" id="role-mentor" className="sr-only" />
                            <Users className={`h-6 w-6 ${selectedRole === 'mentor_externo' ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                            <span className={`text-sm font-medium ${selectedRole === 'mentor_externo' ? 'text-primary' : 'text-foreground'}`}>
                              {t('login.externalMentor')}
                            </span>
                            <span className="text-xs text-muted-foreground text-center">
                              {t('login.mentorDesc')}
                            </span>
                          </Label>
                        </RadioGroup>
                      )}
                    </div>
                    
                    <Button
                      type="submit" 
                      className="w-full h-11 text-base font-medium transition-all duration-300 hover:shadow-lg hover:shadow-primary/25" 
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" aria-hidden="true" />
                          {t('login.creatingAccount')}
                        </span>
                      ) : t('login.createAccount')}
                    </Button>
                  </form>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            {t('login.termsAgree')}
          </p>
        </div>
      </div>
      
      <ForgotPasswordDialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen} />
    </div>
  );
}
