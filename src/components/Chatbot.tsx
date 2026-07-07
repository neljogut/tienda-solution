import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useCartStore } from '../store/cartStore';
import { getProductImages } from '../utils/productImages';
import type { BusinessSettings } from '../types/settings';
import type { Product } from '../types/product';
import { 
  MessageSquare, X, Send, Bot, User, ShoppingCart
} from 'lucide-react';

interface ChatbotProps {
  businessSettings: BusinessSettings | null;
}

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  products?: Product[];
  timestamp: Date;
}

export const Chatbot: React.FC<ChatbotProps> = ({ businessSettings }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const { addItem, openDrawer, clearCart, isDrawerOpen } = useCartStore();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);

  // Fetch catalog products on mount for search & context
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const snap = await getDocs(collection(db, 'products'));
        const prods: Product[] = [];
        snap.forEach((doc) => {
          prods.push({ id: doc.id, ...doc.data() } as Product);
        });
        setProducts(prods);
      } catch (e) {
        console.error('Error loading products for chatbot:', e);
      }
    };
    fetchProducts();
  }, []);

  const handleOpenChat = () => {
    setIsOpen(true);
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          sender: 'bot',
          text: `¡Hola! Soy tu asistente virtual de ${businessSettings?.name || 'la tienda'}. Estoy aquí para guiarte en tu compra, recomendarte productos y responder tus consultas del negocio.\n\n¿En qué te puedo ayudar hoy?`,
          timestamp: new Date()
        }
      ]);
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Close chatbot window if the cart drawer is opened to avoid overlaps
  useEffect(() => {
    if (isDrawerOpen) {
      setIsOpen(false);
    }
  }, [isDrawerOpen]);

  // Close chat when clicking outside the chat window
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (isOpen && chatWindowRef.current && !chatWindowRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleProductCardClick = (product: Product) => {
    navigate(`/catalog/${product.id}`);
    setIsOpen(false);
  };

  const handleAddToCart = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    const price = product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice;
    addItem({
      productId: product.id,
      name: product.name,
      type: product.type,
      price: price,
      basePrice: price,
      priceTiers: product.priceTiers,
      weightGrams: (product as any).weightGrams,
      categoryId: product.categoryId,
      category: product.category,
      isKeychain: (product as any).isKeychain,
      imageUrl: product.mainImage,
      maxStock: product.stock !== undefined ? product.stock : 999,
      variantGroup: product.variantGroup
    } as any);
    openDrawer();
  };

  // Local rules-based search matching engine (fallback)
  const getLocalResponse = (query: string): { text: string; products?: Product[] } => {
    const cleanQuery = query.toLowerCase().trim();
    
    // Keyword arrays
    const materialsKeywords = ['pla', 'abs', 'petg', 'flex', 'tpu', 'material', 'plastico', 'plástico', 'filamento', 'filamentos'];
    const itKeywords = ['comput', 'cpu', 'gpu', 'placa', 'video', 'ram', 'disco', 'ssd', 'teclado', 'mouse', 'monitor', 'informática', 'pc', 'componente', 'fuente', 'gabinete'];
    const contactKeywords = ['contacto', 'telefono', 'teléfono', 'celular', 'whatsapp', 'mail', 'correo', 'instagram', 'ig', 'redes'];
    const addressKeywords = ['ubicacion', 'direccion', 'dirección', 'local', 'donde', 'dónde', 'sucursal', 'ciudad', 'provincia', 'mapa', 'calle'];
    const paymentKeywords = ['cuit', 'cbu', 'alias', 'transferencia', 'pago', 'pagar', 'efectivo', 'tarjeta', 'mercadopago', 'mp'];

    // 1. Matches: Materials
    if (materialsKeywords.some(kw => cleanQuery.includes(kw))) {
      const filaments = products.filter(p => 
        p.category?.toLowerCase().includes('filamento') || 
        p.name.toLowerCase().includes('filamento') ||
        p.name.toLowerCase().includes('pla') ||
        p.name.toLowerCase().includes('abs') ||
        p.name.toLowerCase().includes('petg')
      ).slice(0, 3);

      return {
        text: 'Contamos con una amplia variedad de filamentos para impresión 3D como PLA (fácil de imprimir, biodegradable), ABS (resistente a impactos y temperatura) y PETG (ideal para piezas mecánicas y exteriores).\n\nTe recomiendo los siguientes filamentos disponibles:',
        products: filaments
      };
    }

    // 2. Matches: IT Components
    if (itKeywords.some(kw => cleanQuery.includes(kw))) {
      const itProducts = products.filter(p => 
        p.category?.toLowerCase().includes('inform') || 
        p.category?.toLowerCase().includes('comput') ||
        p.name.toLowerCase().includes('placa') ||
        p.name.toLowerCase().includes('disco') ||
        p.name.toLowerCase().includes('ssd') ||
        p.name.toLowerCase().includes('memoria') ||
        p.name.toLowerCase().includes('teclado')
      ).slice(0, 3);

      if (itProducts.length > 0) {
        return {
          text: 'Ofrecemos componentes de hardware, periféricos y servicio técnico de informática. Aquí tenés algunos de los productos informáticos más consultados:',
          products: itProducts
        };
      }
      return {
        text: 'Ofrecemos componentes de hardware, periféricos y servicio técnico de informática para tu PC. Consultanos por presupuestos de actualización o reparación de equipos.'
      };
    }

    // 3. Matches: Contact Details
    if (contactKeywords.some(kw => cleanQuery.includes(kw))) {
      const parts = [];
      if (businessSettings?.phone) parts.push(`📞 **WhatsApp/Teléfono:** ${businessSettings.phone}`);
      if (businessSettings?.email) parts.push(`✉️ **Email:** ${businessSettings.email}`);
      if (businessSettings?.instagram) parts.push(`📸 **Instagram:** ${businessSettings.instagram}`);
      if (businessSettings?.tiktok) parts.push(`🎵 **TikTok:** ${businessSettings.tiktok}`);
      
      return {
        text: `Podés ponerte en contacto con nosotros a través de los siguientes canales:\n\n${parts.join('\n') || 'No se han configurado canales de contacto aún.'}`
      };
    }

    // 4. Matches: Location & Address
    if (addressKeywords.some(kw => cleanQuery.includes(kw))) {
      const parts = [];
      if (businessSettings?.address) parts.push(`📍 **Dirección:** ${businessSettings.address}`);
      if (businessSettings?.city) parts.push(`🏙️ **Ciudad:** ${businessSettings.city}`);
      if (businessSettings?.province) parts.push(`🏛️ **Provincia:** ${businessSettings.province}`);
      
      return {
        text: `Nuestra ubicación física:\n\n${parts.join('\n') || 'No se ha configurado la dirección física de la tienda.'}`
      };
    }

    // 5. Matches: Payment Info & CUIT
    if (paymentKeywords.some(kw => cleanQuery.includes(kw))) {
      const parts = [];
      if (businessSettings?.cuit) parts.push(`📋 **CUIT:** ${businessSettings.cuit}`);
      
      return {
        text: `Aceptamos transferencias bancarias, Mercado Pago y efectivo al retirar.\n\n${parts.join('\n') || ''}\nSi necesitás los datos de CBU o alias bancario para abonar un pedido, podés visualizarlos al momento de confirmar tu carrito en el Checkout.`
      };
    }

    // 6. Generic Catalog Product Search
    const searchTerms = cleanQuery.split(/\s+/).filter(t => t.length > 2);
    if (searchTerms.length > 0) {
      const matched = products.filter(p => 
        searchTerms.every(term => 
          p.name.toLowerCase().includes(term) || 
          p.category?.toLowerCase().includes(term) || 
          p.description?.toLowerCase().includes(term)
        )
      ).slice(0, 4);

      if (matched.length > 0) {
        return {
          text: `Encontré estos productos en nuestro catálogo que coinciden con tu búsqueda:`,
          products: matched
        };
      }
    }

    // 7. Default Fallback
    return {
      text: '¡Hola! Estoy entrenado para ayudarte con tus dudas sobre la tienda, materiales 3D e informática, y ayudarte a buscar productos en nuestro catálogo.\n\n¿Te gustaría buscar algún producto en especial (ej: "pla", "teclado") o consultar nuestros datos de contacto?'
    };
  };

  // Google Gemini API query engine
  const queryGemini = async (userQuery: string): Promise<{ text: string; products?: Product[] }> => {
    const apiKey = businessSettings?.geminiApiKey;
    if (!apiKey) {
      return getLocalResponse(userQuery);
    }

    try {
      // Build context of business settings
      const businessContext = `
        Nombre de la tienda: ${businessSettings.name || 'SOLUTION'}
        Responsable: ${businessSettings.ownerName || ''}
        Dirección: ${businessSettings.address || ''}, ${businessSettings.city || ''}, ${businessSettings.province || ''}
        CUIT: ${businessSettings.cuit || ''}
        Contacto: Teléfono: ${businessSettings.phone || ''}, Email: ${businessSettings.email || ''}, Instagram: ${businessSettings.instagram || ''}, Tiktok: ${businessSettings.tiktok || ''}
        Descripción comercial: ${businessSettings.description || 'Tienda de informática e impresión 3D'}
      `;

      // Build context of products (simplified to save tokens and improve performance)
      const productsContext = products.map(p => ({
        id: p.id,
        nombre: p.name,
        categoria: p.category || '',
        precio: p.useManualPrice ? p.manualRetailPrice : p.calculatedRetailPrice,
        stock: p.stock ?? 0,
        descripcion: p.description || ''
      }));

      const systemInstruction = `
        Eres el asistente virtual de atención al cliente de la tienda de tecnología e impresión 3D "${businessSettings.name || 'SOLUTION'}".
        Tu único objetivo es responder dudas sobre el negocio, los materiales 3D (PLA, ABS, PETG, etc.), asesorar en informática y recomendar o agregar productos del catálogo disponible al carrito.
        
        DATOS DEL NEGOCIO:
        ${businessContext}

        CATÁLOGO DE PRODUCTOS DISPONIBLES (Formato JSON):
        ${JSON.stringify(productsContext)}

        INSTRUCCIONES CLAVE:
        1. Sé sumamente breve, directo y conciso. Tus respuestas de texto deben tener como MÁXIMO de 2 a 3 oraciones en total. Evita explicaciones técnicas largas o rodeos. Usa Español de Argentina de manera sutil si aplica.
        2. CONTEXTO LOCAL DE ARGENTINA: Entiende el contexto cultural y deportivo argentino (ej. si el usuario menciona "Boca" o una "jarra de boca", se refiere al Club Atlético Boca Juniors, cuyos colores son azul y amarillo; si menciona "River", se refiere a River Plate, cuyos colores son blanco y rojo). No lo interpretes literalmente (por ejemplo, "jarra de boca" no es una jarra con forma de boca humana, sino una jarra con los colores de Boca Juniors: azul y amarillo).
        3. Está TOTALMENTE PROHIBIDO escribir listas de texto con viñetas, asteriscos, guiones o nombres de productos dentro de tu respuesta conversacional (por ejemplo, nunca escribas listas textuales como "* **FILAR PLA...**").
        4. Para recomendar o mostrar productos, debes usar EXCLUSIVAMENTE el formato de etiquetas de tarjetas [PRODUCT_IDS: id1, id2] al final de tu respuesta (donde id1, id2 son los IDs del catálogo). Deja que el sistema de la tienda se encargue de mostrar las tarjetas interactivas de forma mucho más vistosa.
        5. SUGERIR ALTERNATIVAS DE MATERIALES: Si te piden un producto o color en un material específico (ej. PETG) y no lo tienes en stock, pero sí tienes ese mismo color en otro material (ej. PLA), menciónalo muy brevemente como alternativa y recomiéndalo (ej. "No tengo filamento PETG amarillo, pero te sugiero el PLA Amarillo que sí tenemos en stock").
        6. Responde estrictamente sobre temas del negocio, impresión 3D, informática o el catálogo de productos. Si te preguntan sobre temas ajenos, debes rechazar responder cortésmente.
        7. ACCIONES SOBRE EL CARRITO: Si el cliente te pide agregar productos al carrito, vaciarlo, o ir a pagar/ver el carrito, responde confirmando la acción de manera muy breve (1 oración) y escribe obligatoriamente el comando correspondiente al final:
           - Para agregar productos al carrito: [ADD_TO_CART: id_producto] o con cantidad [ADD_TO_CART: id_producto, cantidad] (si te piden agregar más de un producto, incluye múltiples tags separados por espacio, ej: [ADD_TO_CART: f5G2k, 1] [ADD_TO_CART: h8Y1q, 2]).
           - Para ver el carrito / ir a pagar / abrir el carrito: [OPEN_CHECKOUT]
           - Para vaciar o limpiar el carrito: [CLEAR_CART]
           IMPORTANTE: Revisa el catálogo disponible arriba para obtener el ID de producto correcto. Si el cliente pide agregar algo que no existe o no especificó qué producto, no generes el comando de acción y pídele que aclare primero.
      `;

      // Build contents history to allow conversational thread following (strict user/model alternation)
      const rawHistory = [...messages, { sender: 'user', text: userQuery }];
      const recent = rawHistory.slice(-12);
      const firstUserIdx = recent.findIndex(m => m.sender === 'user');
      
      let contents;
      if (firstUserIdx === -1) {
        contents = [
          {
            role: 'user',
            parts: [{ text: userQuery }]
          }
        ];
      } else {
        const validHistory = recent.slice(firstUserIdx);
        const apiMessages: { role: string; parts: { text: string }[] }[] = [];
        let lastRole = '';
        
        validHistory.forEach((msg) => {
          const role = msg.sender === 'user' ? 'user' : 'model';
          // Skip if role duplicates consecutive entries (keeps strict user/model sequence)
          if (role !== lastRole) {
            apiMessages.push({
              role,
              parts: [{ text: msg.text }]
            });
            lastRole = role;
          }
        });
        contents = apiMessages;
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents,
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            },
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2000
            }
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const errMsg = errData?.error?.message || response.statusText || `Status ${response.status}`;
        throw new Error(`Gemini API request failed: ${errMsg}`);
      }

      const data = await response.json();
      let responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (!responseText) {
        return getLocalResponse(userQuery);
      }

      // Parse product recommendation IDs if returned in the format [PRODUCT_IDS: id1, id2]
      let recommendedProducts: Product[] = [];
      const match = responseText.match(/\[PRODUCT_IDS:\s*([^\]]+)\]/i);
      if (match) {
        const ids = match[1].split(',').map((id: string) => id.trim());
        recommendedProducts = products.filter(p => ids.includes(p.id));
        // Strip the raw tag from the response so the user doesn't see the raw ID hook
        responseText = responseText.replace(/\[PRODUCT_IDS:\s*([^\]]+)\]/gi, '').trim();
      }

      // 1. Process and execute all ADD_TO_CART commands
      const addToCartRegex = /\[ADD_TO_CART\s*:\s*([^\]\s,]+)(?:\s*,\s*(\d+))?\s*\]/gi;
      let matchAddToCart;
      let itemsAdded = 0;
      
      while ((matchAddToCart = addToCartRegex.exec(responseText)) !== null) {
        const prodId = matchAddToCart[1].trim();
        const qty = matchAddToCart[2] ? parseInt(matchAddToCart[2]) : 1;
        const prod = products.find(p => p.id === prodId);
        if (prod) {
          const price = prod.useManualPrice ? prod.manualRetailPrice : prod.calculatedRetailPrice;
          addItem({
            productId: prod.id,
            name: prod.name,
            type: prod.type,
            price: price,
            basePrice: price,
            priceTiers: prod.priceTiers,
            weightGrams: (prod as any).weightGrams,
            categoryId: prod.categoryId,
            category: prod.category,
            isKeychain: (prod as any).isKeychain,
            imageUrl: prod.mainImage,
            maxStock: prod.stock !== undefined ? prod.stock : 999,
            variantGroup: prod.variantGroup,
            quantity: qty
          } as any);
          itemsAdded++;
        }
      }
      
      if (itemsAdded > 0) {
        openDrawer();
        // Clean all ADD_TO_CART tags from the response
        responseText = responseText.replace(/\[ADD_TO_CART:\s*[^\]]+\s*\]/gi, '').trim();
      }

      // 2. Check for OPEN_CHECKOUT command
      if (responseText.match(/\[OPEN_CHECKOUT\]/i)) {
        openDrawer();
        responseText = responseText.replace(/\[OPEN_CHECKOUT\]/gi, '').trim();
      }

      // 3. Check for CLEAR_CART command
      if (responseText.match(/\[CLEAR_CART\]/i)) {
        clearCart();
        responseText = responseText.replace(/\[CLEAR_CART\]/gi, '').trim();
      }

      return {
        text: responseText,
        products: recommendedProducts.length > 0 ? recommendedProducts : undefined
      };

    } catch (e: any) {
      console.error('Error querying Gemini API, falling back to local engine:', e);
      return {
        text: `Error de conexión con la IA: ${e?.message || e}. Mostrando respuesta local de respaldo:\n\n` + getLocalResponse(userQuery).text
      };
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userText = inputText;
    setInputText('');
    
    // Add user message
    const userMsg: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: userText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);

    setIsLoading(true);

    // Get response (Gemini or Local)
    const result = await queryGemini(userText);

    // Add bot response
    const botMsg: Message = {
      id: Math.random().toString(),
      sender: 'bot',
      text: result.text,
      products: result.products,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, botMsg]);
    setIsLoading(false);
  };

  const items = useCartStore(state => state.items);
  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const showFloatingCart = totalItems > 0;

  return (
    <div className={`fixed z-[999] font-sans transition-all duration-300 ${
      isOpen 
        ? 'bottom-6 right-6 lg:bottom-8 lg:right-8' 
        : showFloatingCart 
          ? 'bottom-24 right-6 lg:bottom-28 lg:right-8' 
          : 'bottom-6 right-6 lg:bottom-8 lg:right-8'
    }`}>
      {/* Floating Chat Button */}
      {!isOpen && !isDrawerOpen && (
        <button
          onClick={handleOpenChat}
          className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all hover:scale-105 active:scale-95 animate-bounce-subtle group"
          title="Asistente de IA"
        >
          <MessageSquare size={24} className="group-hover:rotate-6 transition-transform duration-300" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 text-[9px] text-white font-extrabold items-center justify-center">AI</span>
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div 
          ref={chatWindowRef}
          className="w-[350px] sm:w-[380px] h-[500px] bg-slate-900 rounded-3xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-slideUp"
        >
          
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-white/5 px-4 py-3.5 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Bot size={18} className="text-white" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white leading-tight">{businessSettings?.name || 'Asistente Solution'}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[9px] text-slate-400 font-semibold tracking-wider uppercase">En Línea</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {messages.map((msg) => (
              <div 
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'bot' && (
                  <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5 border border-white/5">
                    <Bot size={14} className="text-blue-400" />
                  </div>
                )}
                
                <div className="flex flex-col gap-1.5 max-w-[80%]">
                  <div 
                    className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-line ${
                      msg.sender === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none font-medium' 
                        : 'bg-slate-800 text-slate-100 border border-white/5 rounded-tl-none font-normal'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Recommended products inside message */}
                  {msg.products && msg.products.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      {msg.products.map(product => {
                        const prodImg = getProductImages(product)[0] || '/placeholder.png';
                        const price = product.useManualPrice ? product.manualRetailPrice : product.calculatedRetailPrice;
                        return (
                          <div 
                            key={product.id}
                            onClick={() => handleProductCardClick(product)}
                            className="flex items-center gap-2 bg-slate-950/60 border border-white/5 rounded-xl p-2 animate-fadeIn hover:bg-slate-950 hover:border-white/20 transition-all duration-200 cursor-pointer group/card"
                          >
                            <img 
                              src={prodImg} 
                              className="w-11 h-11 object-cover rounded-lg bg-slate-900 flex-shrink-0 border border-white/5" 
                              alt={product.name} 
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[11px] font-bold text-white truncate">{product.name}</h4>
                              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">${price.toLocaleString('es-AR')}</p>
                            </div>
                            <button
                              onClick={(e) => handleAddToCart(e, product)}
                              className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex-shrink-0 flex items-center justify-center"
                              title="Agregar al carrito"
                            >
                              <ShoppingCart size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0 mt-0.5 border border-blue-500/20">
                    <User size={14} className="text-blue-400" />
                  </div>
                )}
              </div>
            ))}
            
            {/* Loading / Typing indicator */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 border border-white/5">
                  <Bot size={14} className="text-blue-400" />
                </div>
                <div className="bg-slate-800 text-slate-300 border border-white/5 rounded-2xl rounded-tl-none px-4 py-2.5 flex items-center gap-1.5 h-8">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Form */}
          <form 
            onSubmit={handleSendMessage}
            className="p-3 bg-slate-900 border-t border-white/5 flex items-center gap-2 flex-shrink-0"
          >
            <input
              type="text"
              placeholder="Preguntale al bot..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-slate-800 border border-white/5 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
